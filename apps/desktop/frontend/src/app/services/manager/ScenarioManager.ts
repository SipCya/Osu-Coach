import { inject, injectable } from "inversify";
import { BehaviorSubject } from "rxjs";
import { Beatmap, buildBeatmap, modsToBitmask, parseBlueprint } from "@osujs/core";
import { Texture } from "pixi.js";
import { GameSimulator } from "../common/game/GameSimulator";
import { AudioService } from "../common/audio/AudioService";
import { ReplayService } from "../common/local/ReplayService";
import { BeatmapManager } from "./BeatmapManager";
import { ReplayManager } from "./ReplayManager";
import { AnalysisSceneKeys, AnalysisSceneManager } from "./AnalysisSceneManager";
import { AudioEngine } from "../common/audio/AudioEngine";
import { GameplayClock } from "../common/game/GameplayClock";
import { GameLoop } from "../common/game/GameLoop";
import { PixiRendererManager } from "../renderers/PixiRendererManager";
import { dirname, join } from "path";
import { readFile, readdir } from "fs/promises";
import { BlueprintLocatorService } from "../common/local/BlueprintLocatorService";
import { OsuFolderService } from "../common/local/OsuFolderService";
import { BeatmapBackgroundSettingsStore } from "../common/beatmap-background";
import { TextureManager } from "../textures/TextureManager";
import { ReplayFileWatcher } from "../common/local/ReplayFileWatcher";
import { ModSettingsService } from "../analysis/mod-settings";
import { HitsoundPlayer } from "../hitsounds/HitsoundPlayer";
import { buildContinuousEvents, buildHitsoundEvents } from "../hitsounds/hitsound-events";
import { recordCoachingEntry } from "../coach/coaching-history";
import { StoryboardSound } from "../hitsounds/HitsoundPlayer";
import { parseStoryboardSamples } from "../hitsounds/storyboard";
import { parseHitsoundData } from "../hitsounds/hitsound-data";
import { SkinSettingsStore } from "../common/skin";
import { HitsoundSettingsStore } from "../common/hitsound";
import { SkinLoader } from "../common/local/SkinLoader";
import { stringToSkinId } from "../../model/SkinId";
import { STAGE_TYPES } from "../types";

interface Scenario {
  status: "LOADING" | "ERROR" | "DONE" | "INIT";
}

function localFile(path: string) {
  return `file://${path}`;
}

@injectable()
export class ScenarioManager {
  public scenario$: BehaviorSubject<Scenario>;

  constructor(
    private readonly gameClock: GameplayClock,
    private readonly renderer: PixiRendererManager,
    private readonly gameLoop: GameLoop,
    private readonly gameSimulator: GameSimulator,
    private readonly modSettingsService: ModSettingsService,
    private readonly blueprintLocatorService: BlueprintLocatorService,
    private readonly osuFolderService: OsuFolderService,
    private readonly audioService: AudioService,
    private readonly textureManager: TextureManager,
    private readonly replayService: ReplayService,
    private readonly beatmapBackgroundSettingsStore: BeatmapBackgroundSettingsStore,
    private readonly beatmapManager: BeatmapManager,
    private readonly replayManager: ReplayManager,
    private readonly sceneManager: AnalysisSceneManager,
    private readonly replayWatcher: ReplayFileWatcher,
    private readonly audioEngine: AudioEngine,
    private readonly hitsoundPlayer: HitsoundPlayer,
    private readonly skinSettingsStore: SkinSettingsStore,
    private readonly skinLoader: SkinLoader,
    private readonly hitsoundSettingsStore: HitsoundSettingsStore,
    @inject(STAGE_TYPES.BUILT_IN_SKINS_FOLDER) private readonly builtInSkinsFolder: string,
  ) {
    this.scenario$ = new BehaviorSubject<Scenario>({ status: "INIT" });
    this.skinSettingsStore.settings$.subscribe(() => {
      void this.hitsoundPlayer.changeSkinFolder(this.currentSkinFolder());
    });
    this.hitsoundSettingsStore.settings$.subscribe((s) => {
      void this.hitsoundPlayer.setUseBeatmapHitsounds(s.useBeatmapHitsounds);
    });
  }

  private currentSkinFolder(): string | null {
    try {
      return this.skinLoader.resolveToPath(stringToSkinId(this.skinSettingsStore.settings.preferredSkinId));
    } catch {
      return null;
    }
  }

  /** Storyboard `Sample` events from the `.osu` plus any `.osb`, resolved to absolute file paths. */
  private async collectStoryboardSamples(rawOsu: string, folder: string): Promise<StoryboardSound[]> {
    const texts = [rawOsu];
    try {
      for (const name of await readdir(folder)) {
        if (name.toLowerCase().endsWith(".osb")) {
          try {
            texts.push(await readFile(join(folder, name), "utf-8"));
          } catch {
            /* unreadable .osb — skip it */
          }
        }
      }
    } catch {
      /* folder not listable — just use the .osu */
    }
    const samples: StoryboardSound[] = [];
    for (const text of texts) {
      for (const s of parseStoryboardSamples(text)) {
        samples.push({ time: s.time, file: join(folder, s.file.replace(/\\/g, "/")), volume: s.volume });
      }
    }
    return samples;
  }

  public initialize() {
    this.replayWatcher.newReplays$.subscribe((replayId) => {
      void this.loadReplay(replayId);
    });
  }

  async clearReplay() {
    this.gameClock.clear();
    this.replayManager.setMainReplay(null);
    this.audioEngine.destroy();
    this.renderer.getRenderer()?.clear();
    this.beatmapManager.setBeatmap(Beatmap.EMPTY_BEATMAP);
    this.gameSimulator.clear();
    this.hitsoundPlayer.clear();
    this.gameLoop.stopTicker();
    this.scenario$.next({ status: "INIT" });
  }

  async loadReplay(replayId: string) {
    console.log(`ScenarioManager loading replay with id = ${replayId}`);
    this.audioEngine.destroy();

    this.scenario$.next({ status: "LOADING" });

    const replay = await this.replayService.retrieveReplay(replayId);
    const blueprintInfo = await this.blueprintLocatorService.getBlueprintByMD5(replay.beatmapMd5);
    if (!blueprintInfo) throw Error(`Could not find the blueprint with MD5=${replay.beatmapMd5}`);

    const absoluteFolderPath = join(this.osuFolderService.songsFolder$.getValue(), blueprintInfo.folderName);

    const rawBlueprint = await readFile(join(absoluteFolderPath, blueprintInfo.osuFileName), "utf-8");
    const blueprint = parseBlueprint(rawBlueprint);

    const { metadata } = blueprint.blueprintInfo;

    this.beatmapBackgroundSettingsStore.texture$.next(
      await this.textureManager.loadTexture(localFile(join(absoluteFolderPath, metadata.backgroundFile))),
    );

    this.audioEngine.setSong(
      await this.audioService.loadAudio(localFile(join(absoluteFolderPath, metadata.audioFile))),
    );
    this.audioEngine.song?.mediaElement.addEventListener("loadedmetadata", () => {
      const duration = (this.audioEngine.song?.mediaElement.duration ?? 0) * 1000;
      this.gameClock.setDuration(duration);
      this.gameSimulator.calculateDifficulties(rawBlueprint, duration, modsToBitmask(replay.mods));
    });

    const beatmap = buildBeatmap(blueprint, { addStacking: true, mods: replay.mods });

    console.log(`Beatmap built with ${beatmap.hitObjects.length} hitobjects`);
    console.log(`Replay loaded with ${replay.frames.length} frames`);
    const initialSpeed = beatmap.gameClockRate;

    this.modSettingsService.setHiddenAvailable(replay.mods.includes("HIDDEN"));
    this.modSettingsService.setHidden(false);
    this.modSettingsService.setFlashlight(false);

    this.gameClock.pause();
    this.gameClock.setSpeed(initialSpeed);
    this.gameClock.seekTo(0);
    this.beatmapManager.setBeatmap(beatmap);
    this.replayManager.setMainReplay(replay);

    await this.gameSimulator.simulateReplay(beatmap, replay);
    this.hitsoundPlayer.clear();
    const finalState = this.gameSimulator.getFinalState();
    if (finalState) {
      const hitsoundData = parseHitsoundData(rawBlueprint);
      const events = buildHitsoundEvents(beatmap.hitObjects, finalState, hitsoundData);
      const continuous = buildContinuousEvents(beatmap.hitObjects, finalState, hitsoundData);
      const storyboard = await this.collectStoryboardSamples(rawBlueprint, absoluteFolderPath);
      this.hitsoundPlayer
        .load(events, continuous, storyboard, {
          beatmap: absoluteFolderPath,
          skin: this.currentSkinFolder(),
          fallback: join(this.builtInSkinsFolder, "OsuDefaultSkin"),
          useBeatmapHitsounds: this.hitsoundSettingsStore.settings.useBeatmapHitsounds,
        })
        .catch((e) => console.error("Could not load hitsounds", e));
    }

    // Record this analysis into the cross-session coaching history (for the Progress panel).
    const coach = this.gameSimulator.coach$.getValue();
    if (coach) {
      const { great, ok, meh } = coach.timing.counts;
      const miss = coach.mistakes.filter((m) => m.kind === "Miss").length;
      const total = great + ok + meh + miss;
      const aim = coach.mistakes.filter((m) => m.category === "Aim").length;
      const tapping = coach.mistakes.filter((m) => m.category === "Tapping").length;
      recordCoachingEntry({
        replayHash: replay.md5hash,
        beatmapMd5: replay.beatmapMd5,
        date: Date.now(),
        title: metadata.title,
        artist: metadata.artist,
        player: replay.player,
        mods: replay.mods,
        accuracy: total > 0 ? (300 * great + 100 * ok + 50 * meh) / (300 * total) : 0,
        ur: coach.timing.ur,
        meanErrorMs: coach.timing.meanErrorMs,
        suggestedOffsetMs: coach.timing.suggestedOffsetMs,
        counts: { great, ok, meh, miss },
        misses: { aim, tapping, other: coach.mistakes.length - aim - tapping },
      });
    }

    await this.sceneManager.changeToScene(AnalysisSceneKeys.ANALYSIS);

    this.gameLoop.startTicker();
    this.scenario$.next({ status: "DONE" });
  }

  async loadBeatmap(blueprintId: string) {
    this.gameClock.setSpeed(1.0);
    this.gameClock.seekTo(0);
    this.modSettingsService.setHidden(false);
    this.modSettingsService.setHiddenAvailable(false);
    this.replayManager.setMainReplay(null);
  }

  /**
   * Renders a beatmap on its own (no replay) from a raw .osu file, like an editor preview:
   * notes and approach circles are drawn and the song plays in sync with the game clock.
   */
  async loadBeatmapPreview(osuFilePath: string) {
    console.log(`ScenarioManager loading beatmap preview from = ${osuFilePath}`);
    this.audioEngine.destroy();
    this.scenario$.next({ status: "LOADING" });

    const absoluteFolderPath = dirname(osuFilePath);
    const rawBlueprint = await readFile(osuFilePath, "utf-8");
    const blueprint = parseBlueprint(rawBlueprint);
    const { metadata } = blueprint.blueprintInfo;

    try {
      this.beatmapBackgroundSettingsStore.texture$.next(
        await this.textureManager.loadTexture(localFile(join(absoluteFolderPath, metadata.backgroundFile))),
      );
    } catch {
      this.beatmapBackgroundSettingsStore.texture$.next(Texture.EMPTY);
    }

    this.audioEngine.setSong(await this.audioService.loadAudio(localFile(join(absoluteFolderPath, metadata.audioFile))));
    this.audioEngine.song?.mediaElement.addEventListener("loadedmetadata", () => {
      const duration = (this.audioEngine.song?.mediaElement.duration ?? 0) * 1000;
      this.gameClock.setDuration(duration);
    });

    const beatmap = buildBeatmap(blueprint, { addStacking: true, mods: [] });

    this.modSettingsService.setHidden(false);
    this.modSettingsService.setHiddenAvailable(false);
    this.gameClock.pause();
    this.gameClock.setSpeed(1.0);
    this.gameClock.seekTo(0);
    this.beatmapManager.setBeatmap(beatmap);
    this.replayManager.setMainReplay(null);
    this.gameSimulator.clear();
    this.hitsoundPlayer.clear();

    await this.sceneManager.changeToScene(AnalysisSceneKeys.ANALYSIS);
    this.gameLoop.startTicker();
    this.scenario$.next({ status: "DONE" });
  }

  async addSubReplay() {}
}
