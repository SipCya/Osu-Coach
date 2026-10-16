import { ReplayService } from "../common/local/ReplayService";
import { GameplayClock } from "../common/game/GameplayClock";
import { BeatmapManager } from "../manager/BeatmapManager";
import { GameSimulator } from "../common/game/GameSimulator";
import { injectable } from "inversify";
import { PixiRendererManager } from "../renderers/PixiRendererManager";
import { AnalysisSceneManager } from "../manager/AnalysisSceneManager";
import { GameLoop } from "../common/game/GameLoop";
import { ScenarioManager } from "../manager/ScenarioManager";
import { ReplayFileWatcher } from "../common/local/ReplayFileWatcher";
import { OsuFolderService } from "../common/local/OsuFolderService";
import { OsuDBDao } from "../common/local/OsuDBDao";
import { ClipRecorder } from "../manager/ClipRecorder";
import { ModSettingsService } from "./mod-settings";
import { ScreenshotTaker } from "./screenshot";
import { ReplayManager } from "../manager/ReplayManager";
import { OsuReplay } from "../../model/OsuReplay";
import { VideoExporter } from "./VideoExporter";

@injectable()
export class AnalysisApp {
  constructor(
    public readonly gameClock: GameplayClock,
    public readonly gameSimulator: GameSimulator,
    public readonly scenarioManager: ScenarioManager,
    public readonly modSettingsService: ModSettingsService,
    public readonly replayWatcher: ReplayFileWatcher,
    public readonly screenshotTaker: ScreenshotTaker,
    public readonly clipRecorder: ClipRecorder,
    public readonly videoExporter: VideoExporter,
    public readonly osuFolderService: OsuFolderService,
    public readonly osuDBDao: OsuDBDao,
    private readonly replayService: ReplayService,
    private readonly gameLoop: GameLoop,
    public readonly beatmapManager: BeatmapManager,
    public readonly replayManager: ReplayManager,
    private readonly sceneManager: AnalysisSceneManager,
    private readonly pixiRenderer: PixiRendererManager,
  ) {}

  /** Parses a replay file (.osr) without touching the currently loaded one. */
  async parseReplay(path: string): Promise<OsuReplay> {
    return this.replayService.retrieveReplay(path);
  }

  stats() {
    return this.gameLoop.stats();
  }

  initialize() {
    console.log("AnalysisApp: Initialize");
    this.replayWatcher.startWatching();
    this.scenarioManager.initialize();
  }

  close() {}

  onEnter(canvas: HTMLCanvasElement) {
    this.pixiRenderer.initializeRenderer(canvas);
  }

  onHide() {
    this.gameClock.pause();
    this.pixiRenderer.destroy();
  }

  async loadReplay(replayId: string) {
    return this.scenarioManager.loadReplay(replayId);
  }

  async loadBeatmapPreview(osuFilePath: string) {
    return this.scenarioManager.loadBeatmapPreview(osuFilePath);
  }
}
