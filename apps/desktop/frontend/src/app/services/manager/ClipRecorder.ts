import { injectable } from "inversify";
import { PixiRendererManager } from "../renderers/PixiRendererManager";
import { BehaviorSubject } from "rxjs";
import { ipcRenderer } from "electron";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { AudioEngine } from "../common/audio/AudioEngine";
import { GameplayClock } from "../common/game/GameplayClock";

export type ExportPhase = "idle" | "recording" | "converting" | "done" | "error";

export interface ExportProgress {
  phase: ExportPhase;
  value: number;
  file?: string;
  message?: string;
}

export interface ExportVideoOptions {
  fps: number;
  width: number;
  height: number;
  defaultFileName: string;
}

@injectable()
export class ClipRecorder {
  chunks: Blob[] = [];
  recordingSince$: BehaviorSubject<number>;
  exportProgress$: BehaviorSubject<ExportProgress>;
  recorder?: MediaRecorder;
  private exporting = false;

  constructor(
    private readonly renderManager: PixiRendererManager,
    private readonly audioEngine: AudioEngine,
    private readonly gameClock: GameplayClock,
  ) {
    this.recordingSince$ = new BehaviorSubject<number>(0);
    this.exportProgress$ = new BehaviorSubject<ExportProgress>({ phase: "idle", value: 0 });
  }

  startRecording() {
    const renderer = this.renderManager.getRenderer();
    if (!renderer) {
      console.error("Can not start recording without a renderer");
      return;
    }
    this.recordingSince$.next(performance.now());
    this.chunks = [];

    const canvas = renderer.view;
    const frameRate = 30;

    const stream = canvas.captureStream(frameRate);
    this.recorder = new MediaRecorder(stream);
    this.recorder.ondataavailable = (e) => this.chunks.push(e.data);
    this.recorder.onstop = () => {
      this.exportVideo();
    };
    this.recorder.start();
  }

  exportVideo() {
    console.log(`Recording chunks.size = ${this.chunks.length}`);
    this.recordingSince$.next(0);

    const blob = new Blob(this.chunks, { type: "video/webm" });
    const vid = document.createElement("video");
    vid.src = URL.createObjectURL(blob);
    vid.controls = true;

    const a = document.createElement("a");
    a.href = vid.src;
    a.download = `osu!coach Clip ${new Date().toISOString()}.webm`;
    a.click();
    a.remove();
  }

  stopRecording() {
    this.recorder?.stop();
  }

  get isExporting() {
    return this.exporting;
  }

  /**
   * Records the whole loaded replay in real time (with audio) and converts it to an MP4.
   * Progress is published on exportProgress$ so the UI can show a progress bar.
   */
  async exportReplay(options: ExportVideoOptions) {
    if (this.exporting) return;
    const renderer = this.renderManager.getRenderer();
    if (!renderer) {
      this.exportProgress$.next({ phase: "error", value: 0, message: "No renderer" });
      return;
    }
    const duration = this.gameClock.durationInMs;
    if (!(duration > 0)) {
      this.exportProgress$.next({ phase: "error", value: 0, message: "No replay loaded" });
      return;
    }

    const output: string | null = await ipcRenderer.invoke("selectSaveFile", options.defaultFileName, [
      { name: "MP4 Video", extensions: ["mp4"] },
    ]);
    if (!output) return;

    this.exporting = true;
    const canvas = renderer.view;
    const audio = this.audioEngine.createRecordingStream();

    try {
      // Capture at the canvas's native size (the game loop resizes it every frame, so resizing the
      // renderer here would be undone anyway). ffmpeg scales to the chosen resolution afterwards.
      const stream = canvas.captureStream(options.fps);
      audio.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

      this.chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      this.gameClock.pause();
      this.gameClock.seekTo(0);
      this.exportProgress$.next({ phase: "recording", value: 0 });
      recorder.start(1000);
      this.gameClock.start();

      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          const time = this.gameClock.timeElapsedInMs;
          const total = this.gameClock.durationInMs || 1;
          this.exportProgress$.next({ phase: "recording", value: Math.min(1, time / total) });
          if (time >= total - 60) {
            clearInterval(timer);
            resolve();
          }
        }, 150);
      });

      this.gameClock.pause();
      recorder.stop();
      await stopped;
      audio.stop();

      if (this.chunks.length === 0) throw new Error("No frames were captured");

      this.exportProgress$.next({ phase: "converting", value: 1 });
      const blob = new Blob(this.chunks, { type: "video/webm" });
      const buffer = Buffer.from(await blob.arrayBuffer());
      const temp = join(tmpdir(), `osucoach-export-${Date.now()}.webm`);
      await writeFile(temp, buffer);
      try {
        await ipcRenderer.invoke("convertToMp4", { input: temp, output, fps: options.fps, height: options.height });
      } finally {
        await unlink(temp).catch(() => undefined);
      }

      // Stay on the replay: rewind to the start, paused, without touching the loaded scenario.
      this.gameClock.seekTo(0);
      this.exportProgress$.next({ phase: "done", value: 1, file: output });
    } catch (e) {
      audio.stop();
      const message = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      this.exportProgress$.next({ phase: "error", value: 0, message });
    } finally {
      this.exporting = false;
      this.chunks = [];
    }
  }

  resetExport() {
    this.exportProgress$.next({ phase: "idle", value: 0 });
  }
}
