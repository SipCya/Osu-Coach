import { Container, injectable } from "inversify";
import { ReplayService } from "./local/ReplayService";
import { SkinLoader } from "./local/SkinLoader";
import { AudioService } from "./audio/AudioService";
import { createAnalysisApp } from "../analysis/createAnalysisApp";
import { AudioSettingsStore } from "./audio/settings";
import { BeatmapBackgroundSettingsStore } from "./beatmap-background";
import { PlayfieldBorderSettingsStore } from "./playfield-border";
import { AnalysisCursorSettingsStore } from "../analysis/analysis-cursor";
import { ReplayCursorSettingsStore } from "./replay-cursor";
import { SkinHolder, SkinManager, SkinSettingsStore } from "./skin";
import { HitErrorBarSettingsStore } from "./hit-error-bar";
import { PlaybarSettingsStore } from "./playbar";
import { OsuFolderService } from "./local/OsuFolderService";
import { OsuDBDao } from "./local/OsuDBDao";
import { BlueprintLocatorService } from "./local/BlueprintLocatorService";
import { BeatmapRenderService } from "./beatmap-render";
import { STAGE_TYPES } from "../types";
import { AppInfoService } from "./app-info";

@injectable()
export class CommonManagers {
  constructor(
    public readonly skinManager: SkinManager,
    public readonly skinSettingsStore: SkinSettingsStore,
    public readonly audioSettingsService: AudioSettingsStore,
    public readonly beatmapBackgroundSettingsStore: BeatmapBackgroundSettingsStore,
    public readonly beatmapRenderSettingsStore: BeatmapRenderService,
    public readonly hitErrorBarSettingsStore: HitErrorBarSettingsStore,
    public readonly analysisCursorSettingsStore: AnalysisCursorSettingsStore,
    public readonly replayCursorSettingsStore: ReplayCursorSettingsStore,
    public readonly playbarSettingsStore: PlaybarSettingsStore,
    public readonly appInfoService: AppInfoService,
  ) {}

  async initialize() {
    await this.skinManager.loadPreferredSkin();
  }
}

interface Settings {
  builtInSkinsFolder: string;
  appVersion: string;
  appPlatform: string;
}

export function createAppTheater({ builtInSkinsFolder, appPlatform, appVersion }: Settings) {
  const container = new Container({ defaultScope: "Singleton" });
  container.bind(STAGE_TYPES.AUDIO_CONTEXT).toConstantValue(new AudioContext());
  container.bind(STAGE_TYPES.BUILT_IN_SKINS_FOLDER).toConstantValue(builtInSkinsFolder);
  container.bind(STAGE_TYPES.APP_PLATFORM).toConstantValue(appPlatform);
  container.bind(STAGE_TYPES.APP_VERSION).toConstantValue(appVersion);
  container.bind(OsuFolderService).toSelf();
  container.bind(OsuDBDao).toSelf();
  container.bind(BlueprintLocatorService).toSelf();
  container.bind(ReplayService).toSelf();
  container.bind(SkinLoader).toSelf();
  container.bind(SkinHolder).toSelf();
  container.bind(AudioService).toSelf();
  container.bind(SkinManager).toSelf();
  container.bind(AppInfoService).toSelf();

  container.bind(AudioSettingsStore).toSelf();
  container.bind(AnalysisCursorSettingsStore).toSelf();
  container.bind(BeatmapBackgroundSettingsStore).toSelf();
  container.bind(BeatmapRenderService).toSelf();
  container.bind(HitErrorBarSettingsStore).toSelf();
  container.bind(PlayfieldBorderSettingsStore).toSelf();
  container.bind(ReplayCursorSettingsStore).toSelf();
  container.bind(SkinSettingsStore).toSelf();
  container.bind(PlaybarSettingsStore).toSelf();

  container.bind(CommonManagers).toSelf();

  return {
    common: container.get(CommonManagers),
    analyzer: createAnalysisApp(container),
  };
}

export type AppTheater = ReturnType<typeof createAppTheater>;
