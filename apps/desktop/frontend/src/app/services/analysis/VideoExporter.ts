import { injectable } from "inversify";
import { BehaviorSubject } from "rxjs";
import { Graphics, RenderTexture } from "pixi.js";
import { ipcRenderer } from "electron";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import { GameplayClock } from "../common/game/GameplayClock";
import { GameSimulator } from "../common/game/GameSimulator";
import { GameLoop } from "../common/game/GameLoop";
import { PixiRendererManager } from "../renderers/PixiRendererManager";
import { AnalysisStage } from "../renderers/components/stage/AnalysisStage";
import { AudioEngine } from "../common/audio/AudioEngine";
import { HitsoundPlayer } from "../hitsounds/HitsoundPlayer";
import { BeatmapManager } from "../manager/BeatmapManager";
import { ReplayManager } from "../manager/ReplayManager";
import { HitErrorBarSettingsStore } from "../common/hit-error-bar";
import { PlayfieldBorderSettingsStore } from "../common/playfield-border";
import { BeatmapBackgroundSettingsStore } from "../common/beatmap-background";
import { ReplayCursorSettingsStore } from "../common/replay-cursor";
import { HudOverlaySettingsStore } from "../common/hud-overlay";
import { AnalysisCursorSettingsStore } from "./analysis-cursor";
import { ModSettingsService } from "./mod-settings";

const START_LEAD_IN_MS = 2000;

/** Encodes an AudioBuffer to 16-bit PCM WAV bytes. */
function audioBufferToWav(buffer: AudioBuffer): Uint8Array {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const blockAlign = numCh * 2;
  const dataSize = numFrames * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Uint8Array(ab);
}

export type ExportPhase = "idle" | "rendering" | "encoding" | "done" | "error";

export interface ExportProgress {
  phase: ExportPhase;
  value: number;
  file?: string;
  message?: string;
  encoder?: string;
  fps?: number;
  elapsedMs?: number;
}

export interface VideoExportOptions {
  // Video
  outputFps: number;
  renderHeight: number; // base render height (720/1080); width follows 16:9
  upscaleHeight?: number; // optional lanczos upscale target (e.g. 2160)
  blurFactor: number; // motion blur: render at outputFps × this, blend down (1 = off)
  // Audio & timing
  includeAudio: boolean; // mux the song + hitsounds
  startAtFirstObject: boolean; // skip the empty intro before the first circle
  // Visuals — all independent from the Reviewer's live settings
  backgroundDim: number; // 0..1
  backgroundBlur: number; // 0..1
  showCursor: boolean;
  showCursorTrail: boolean;
  cursorScale: number; // 0.1..2.0
  showAnalysisCursor: boolean;
  showHitErrorBar: boolean;
  hitErrorBarScale: number; // multiplier
  showPlayfieldBorder: boolean;
  showKeys: boolean;
  showUr: boolean;
  showMods: boolean;
  showStats: boolean;
  applyReplayMods: boolean; // apply the replay's HD/FL visually
  defaultFileName: string;
}

@injectable()
export class VideoExporter {
  exportProgress$ = new BehaviorSubject<ExportProgress>({ phase: "idle", value: 0 });
  private exporting = false;

  constructor(
    private readonly gameClock: GameplayClock,
    private readonly gameSimulator: GameSimulator,
    private readonly gameLoop: GameLoop,
    private readonly renderManager: PixiRendererManager,
    private readonly analysisStage: AnalysisStage,
    private readonly audioEngine: AudioEngine,
    private readonly hitsoundPlayer: HitsoundPlayer,
    private readonly beatmapManager: BeatmapManager,
    private readonly replayManager: ReplayManager,
    private readonly hitErrorBarSettingsStore: HitErrorBarSettingsStore,
    private readonly playfieldBorderSettingsStore: PlayfieldBorderSettingsStore,
    private readonly beatmapBackgroundSettingsStore: BeatmapBackgroundSettingsStore,
    private readonly replayCursorSettingsStore: ReplayCursorSettingsStore,
    private readonly hudOverlaySettingsStore: HudOverlaySettingsStore,
    private readonly analysisCursorSettingsStore: AnalysisCursorSettingsStore,
    private readonly modSettingsService: ModSettingsService,
  ) {}

  get isExporting() {
    return this.exporting;
  }

  reset() {
    this.exportProgress$.next({ phase: "idle", value: 0 });
  }

  private firstObjectMs(): number {
    const beatmap = this.beatmapManager.getBeatmap();
    let min = Infinity;
    for (const o of beatmap.hitObjects as { hitTime?: number; startTime?: number }[]) {
      const s = o.startTime ?? o.hitTime;
      if (typeof s === "number" && Number.isFinite(s)) min = Math.min(min, s);
    }
    return Number.isFinite(min) ? min : 0;
  }

  private audioPath(): string | undefined {
    const src = this.audioEngine.song?.mediaElement.src;
    if (!src) return undefined;
    try {
      return src.startsWith("file:") ? fileURLToPath(src) : src;
    } catch {
      return undefined;
    }
  }

  async exportReplay(options: VideoExportOptions) {
    if (this.exporting) return;
    const renderer = this.renderManager.getRenderer();
    if (!renderer) {
      this.exportProgress$.next({ phase: "error", value: 0, message: "No renderer" });
      return;
    }
    const durationMs = this.gameClock.durationInMs;
    if (!(durationMs > 0)) {
      this.exportProgress$.next({ phase: "error", value: 0, message: "No replay loaded" });
      return;
    }

    const output: string | null = await ipcRenderer.invoke("selectSaveFile", options.defaultFileName, [
      { name: "MP4 Video", extensions: ["mp4"] },
    ]);
    if (!output) return;

    this.exporting = true;
    const height = options.renderHeight;
    const width = Math.round((height * 16) / 9 / 2) * 2;
    const outputFps = options.outputFps;
    const blurFactor = Math.max(1, Math.floor(options.blurFactor || 1));
    const sourceFps = outputFps * blurFactor;
    const startMs = options.startAtFirstObject ? Math.max(0, this.firstObjectMs() - START_LEAD_IN_MS) : 0;
    const total = Math.max(1, Math.ceil(((durationMs - startMs) / 1000) * sourceFps));

    const prevW = renderer.screen.width;
    const prevH = renderer.screen.height;
    // Snapshot every live setting the render reads, so the export is fully independent and we can restore after.
    const snapshot = {
      bg: { ...this.beatmapBackgroundSettingsStore.settings },
      cursor: { ...this.replayCursorSettingsStore.settings },
      analysisCursor: { ...this.analysisCursorSettingsStore.settings },
      hitError: { ...this.hitErrorBarSettingsStore.settings },
      border: { ...this.playfieldBorderSettingsStore.settings },
      overlay: { ...this.hudOverlaySettingsStore.settings },
      mods: { ...this.modSettingsService.modSettings },
    };
    let rt: RenderTexture | null = null;
    let wavTemp: string | undefined;
    let started = false;

    try {
      this.gameLoop.stopTicker();
      this.gameClock.pause();

      // Apply the export's own options (independent from the Reviewer).
      this.beatmapBackgroundSettingsStore.changeSettings((s) => {
        s.enabled = true;
        s.dim = options.backgroundDim;
        s.blur = options.backgroundBlur;
      });
      this.replayCursorSettingsStore.changeSettings((s) => {
        s.enabled = options.showCursor;
        s.showTrail = options.showCursorTrail;
        s.scale = options.cursorScale;
      });
      this.analysisCursorSettingsStore.changeSettings((s) => (s.enabled = options.showAnalysisCursor));
      this.hitErrorBarSettingsStore.changeSettings((s) => {
        s.enabled = options.showHitErrorBar;
        s.scale = options.hitErrorBarScale;
      });
      this.playfieldBorderSettingsStore.setEnabled(options.showPlayfieldBorder);
      this.hudOverlaySettingsStore.changeSettings((s) => {
        s.showKeys = options.showKeys;
        s.showUr = options.showUr;
        s.showMods = options.showMods;
      });
      this.analysisStage.setCleanLook(!options.showStats);
      const replayMods = this.replayManager.getMainReplay()?.mods ?? [];
      this.modSettingsService.setHidden(options.applyReplayMods && replayMods.includes("HIDDEN"));
      this.modSettingsService.setFlashlight(options.applyReplayMods && replayMods.includes("FLASH_LIGHT"));

      renderer.resize(width, height);
      rt = RenderTexture.create({ width, height });
      const extract = renderer.plugins.extract;
      // Opaque black backdrop: bakes dim and all fades into RGB, so dropping alpha for yuv420p is correct.
      const blackBackdrop = new Graphics().beginFill(0x000000, 1).drawRect(0, 0, width, height).endFill();

      // Audio mixdown first (it's an ffmpeg input, needed at spawn time).
      let audioPath: string | undefined;
      if (options.includeAudio) {
        const song = this.audioPath();
        if (song) {
          const mix = await this.hitsoundPlayer.renderMixdown(song, durationMs, startMs);
          if (mix) {
            wavTemp = join(tmpdir(), `osucoach-audio-${Date.now()}.wav`);
            await writeFile(wavTemp, Buffer.from(audioBufferToWav(mix)));
            audioPath = wavTemp;
          } else {
            audioPath = song;
          }
        }
      }

      const encoder: string = await ipcRenderer.invoke("detectVideoEncoder");
      await ipcRenderer.invoke("videoExportStart", {
        width,
        height,
        sourceFps,
        outputFps,
        tmixFrames: blurFactor > 1 ? blurFactor : undefined,
        upscaleHeight: options.upscaleHeight && options.upscaleHeight > height ? options.upscaleHeight : undefined,
        crf: 20,
        encoder,
        audioPath,
        audioTempo: 1,
        output,
      });
      started = true;

      const renderStart = performance.now();
      this.exportProgress$.next({ phase: "rendering", value: 0, encoder });
      for (let i = 0; i <= total; i++) {
        const t = startMs + (i / sourceFps) * 1000;
        this.gameClock.seekTo(t);
        this.gameSimulator.simulate(t);
        this.analysisStage.updateAnalysisStage();
        renderer.render(blackBackdrop, { renderTexture: rt, clear: true });
        renderer.render(this.analysisStage.stage, { renderTexture: rt, clear: false });
        const canvas = extract.canvas(rt);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not read the rendered frame");
        const data = ctx.getImageData(0, 0, width, height).data;
        await ipcRenderer.invoke("videoExportFrame", Buffer.from(data.buffer, data.byteOffset, data.byteLength));
        if (i % 4 === 0) {
          const elapsedMs = performance.now() - renderStart;
          const fps = elapsedMs > 0 ? (i + 1) / (elapsedMs / 1000) : 0;
          this.exportProgress$.next({ phase: "rendering", value: i / total, encoder, fps, elapsedMs });
        }
      }

      blackBackdrop.destroy();
      this.exportProgress$.next({ phase: "encoding", value: 1, encoder });
      await ipcRenderer.invoke("videoExportFinish");
      started = false;
      this.exportProgress$.next({
        phase: "done",
        value: 1,
        file: output,
        encoder,
        elapsedMs: performance.now() - renderStart,
      });
    } catch (e) {
      if (started) await ipcRenderer.invoke("videoExportCancel").catch(() => undefined);
      const message = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      this.exportProgress$.next({ phase: "error", value: 0, message });
    } finally {
      rt?.destroy(true);
      renderer.resize(prevW, prevH);
      this.renderManager.resizeCanvasToDisplaySize();
      // Restore the Reviewer's live settings exactly as they were.
      this.beatmapBackgroundSettingsStore.changeSettings((s) => {
        s.enabled = snapshot.bg.enabled;
        s.dim = snapshot.bg.dim;
        s.blur = snapshot.bg.blur;
      });
      this.replayCursorSettingsStore.changeSettings((s) => {
        s.enabled = snapshot.cursor.enabled;
        s.showTrail = snapshot.cursor.showTrail;
        s.smoothCursorTrail = snapshot.cursor.smoothCursorTrail;
        s.scale = snapshot.cursor.scale;
        s.scaleWithCS = snapshot.cursor.scaleWithCS;
      });
      this.analysisCursorSettingsStore.changeSettings((s) => (s.enabled = snapshot.analysisCursor.enabled));
      this.hitErrorBarSettingsStore.changeSettings((s) => {
        s.enabled = snapshot.hitError.enabled;
        s.scale = snapshot.hitError.scale;
      });
      this.playfieldBorderSettingsStore.setEnabled(snapshot.border.enabled);
      this.hudOverlaySettingsStore.changeSettings((s) => {
        s.showKeys = snapshot.overlay.showKeys;
        s.showUr = snapshot.overlay.showUr;
        s.showMods = snapshot.overlay.showMods;
      });
      this.analysisStage.setCleanLook(false);
      this.modSettingsService.setHidden(snapshot.mods.hidden);
      this.modSettingsService.setFlashlight(snapshot.mods.flashlight);
      this.gameClock.seekTo(0);
      this.gameLoop.startTicker();
      this.exporting = false;
      if (wavTemp) await unlink(wavTemp).catch(() => undefined);
    }
  }
}
