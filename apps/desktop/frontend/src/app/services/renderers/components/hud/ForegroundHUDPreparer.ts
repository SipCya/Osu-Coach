import { inject, injectable } from "inversify";
import { GameSimulator } from "../../../common/game/GameSimulator";
import { Container, Sprite, Text } from "pixi.js";
import { existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { SkinLoader } from "../../../common/local/SkinLoader";
import { SkinSettingsStore } from "../../../common/skin";
import { stringToSkinId } from "../../../../model/SkinId";
import { STAGE_TYPES } from "../../../types";
import {
  calculateDigits,
  OsuClassicAccuracy,
  OsuClassicHitErrorBar,
  OsuClassicNumber,
} from "@osucoach/osu-pixi/classic-components";
import { STAGE_HEIGHT, STAGE_WIDTH } from "../../constants";
import { formatGameTime, hitWindowsForOD } from "@osujs/math";
import { GameplayClock } from "../../../common/game/GameplayClock";
import { BeatmapManager } from "../../../manager/BeatmapManager";
import { mean, standardDeviation } from "simple-statistics";
import { HitErrorBarSettingsStore } from "../../../common/hit-error-bar";
import { HudOverlaySettingsStore } from "../../../common/hud-overlay";
import { SkinHolder } from "../../../common/skin";

const OVERLAY_STYLE = { fontFamily: "Arial", fontWeight: "bold" as const, fill: 0xffffff, stroke: 0x000000 };

const MOD_ICON_FILE: Record<string, string> = {
  NO_FAIL: "nofail",
  EASY: "easy",
  HIDDEN: "hidden",
  HARD_ROCK: "hardrock",
  DOUBLE_TIME: "doubletime",
  NIGHT_CORE: "nightcore",
  HALF_TIME: "halftime",
  FLASH_LIGHT: "flashlight",
  SPUN_OUT: "spunout",
  RELAX: "relax",
  AUTO_PILOT: "relax2",
  AUTO_PLAY: "autoplay",
  SUDDEN_DEATH: "suddendeath",
  PERFECT: "perfect",
};
const MOD_ICON_HEIGHT = 50;
const MOD_ICON_STEP = 42;

function calculateUnstableRate(x: number[]) {
  return x.length === 0 ? 0 : standardDeviation(x) * 10;
}

function calculateMean(x: number[]) {
  return x.length === 0 ? 0 : mean(x);
}

@injectable()
export class ForegroundHUDPreparer {
  container: Container;
  stats: Text;
  hitErrorBar: OsuClassicHitErrorBar;
  urText: Text;
  modIcons: Container;
  private modIconsKey = "";

  /** When false, the debug stats text is hidden (used for a clean osu!-like video export). */
  showStats = true;

  hitMinIndex = 0;
  hitMaxIndex = 0;

  allHits: number[] = [];
  recentHits: number[] = [];

  constructor(
    private readonly beatmapManager: BeatmapManager,
    private readonly skinManager: SkinHolder,
    private readonly gameSimulator: GameSimulator,
    private readonly gameplayClock: GameplayClock,
    private readonly hitErrorBarSettingsStore: HitErrorBarSettingsStore,
    private readonly hudOverlaySettingsStore: HudOverlaySettingsStore,
    private readonly skinLoader: SkinLoader,
    private readonly skinSettingsStore: SkinSettingsStore,
    @inject(STAGE_TYPES.BUILT_IN_SKINS_FOLDER) private readonly builtInSkinsFolder: string,
  ) {
    this.container = new Container();
    this.stats = new Text("", { fontSize: 16, fill: 0xeeeeee, fontFamily: "Arial", align: "left" });
    this.hitErrorBar = new OsuClassicHitErrorBar();
    this.urText = new Text("", { ...OVERLAY_STYLE, fontSize: 22, strokeThickness: 3 });
    this.modIcons = new Container();
  }

  private currentSkinFolder(): string {
    try {
      return this.skinLoader.resolveToPath(stringToSkinId(this.skinSettingsStore.settings.preferredSkinId));
    } catch {
      return "";
    }
  }

  private resolveModIcon(file: string): string | null {
    const name = `selection-mod-${file}.png`;
    const inSkin = join(this.currentSkinFolder(), name);
    if (existsSync(inSkin)) return inSkin;
    const fallback = join(this.builtInSkinsFolder, "YUGEN", name);
    return existsSync(fallback) ? fallback : null;
  }

  /** Builds the mod icon sprites from the current skin (cached until mods or skin change). */
  private buildModIcons(mods: string[]) {
    const key = `${this.currentSkinFolder()}|${mods.join(",")}`;
    if (key === this.modIconsKey) return;
    this.modIconsKey = key;
    this.modIcons.removeChildren();

    const resolved = mods.map((m) => this.resolveModIcon(MOD_ICON_FILE[m] ?? "")).filter((p): p is string => !!p);
    resolved.forEach((path, i) => {
      const sprite = Sprite.from(pathToFileURL(path).href);
      sprite.anchor.set(0.5);
      sprite.scale.set(MOD_ICON_HEIGHT / 128);
      sprite.position.set(MOD_ICON_HEIGHT / 2 + i * MOD_ICON_STEP, MOD_ICON_HEIGHT / 2);
      this.modIcons.addChild(sprite);
    });
    const width = resolved.length ? (resolved.length - 1) * MOD_ICON_STEP + MOD_ICON_HEIGHT : 0;
    this.modIcons.position.set(STAGE_WIDTH - 15 - width, 48);
  }

  updateOverlays() {
    const s = this.hudOverlaySettingsStore.settings;
    if (s.showUr) {
      this.urText.text = `UR ${calculateUnstableRate(this.allHits).toFixed(0)}`;
      this.urText.anchor.set(0.5, 0);
      this.urText.position.set(STAGE_WIDTH / 2, 35);
      this.container.addChild(this.urText);
    }
    if (s.showMods) {
      const mods = this.beatmapManager.getBeatmap()?.appliedMods ?? [];
      if (mods.length > 0) {
        this.buildModIcons(mods);
        this.container.addChild(this.modIcons);
      }
    }
  }

  updateHitErrorBar() {
    const time = this.gameplayClock.timeElapsedInMs;

    const beatmap = this.beatmapManager.getBeatmap();
    const gameClockRate = beatmap.gameClockRate;
    const maxHitErrorTime = 10000;
    const hits: any[] = [];
    this.allHits = [];
    this.recentHits = [];
    for (const [judgementTime, offset, hit] of this.gameSimulator.hits) {
      const timeAgo = time - judgementTime;
      if (timeAgo < 0) break;
      if (timeAgo <= maxHitErrorTime) hits.push({ timeAgo: time - judgementTime, offset, miss: !hit });
      if (hit) {
        this.allHits.push(offset / gameClockRate);
        if (timeAgo < 1000) this.recentHits.push(offset / gameClockRate);
      }
    }

    const [hitWindow300, hitWindow100, hitWindow50] = hitWindowsForOD(beatmap.difficulty.overallDifficulty);
    this.hitErrorBar.prepare({
      hitWindow50,
      hitWindow100,
      hitWindow300,
      hits,
    });
    this.hitErrorBar.container.position.set(STAGE_WIDTH / 2, STAGE_HEIGHT - 20);
    this.hitErrorBar.container.scale.set(this.hitErrorBarSettingsStore.settings.scale);
    this.container.addChild(this.hitErrorBar.container);
  }

  updateComboNumber() {
    const skin = this.skinManager.getSkin();
    const gameplayInfo = this.gameSimulator.getCurrentInfo();

    if (gameplayInfo) {
      const comboNumber = new OsuClassicNumber();
      const textures = skin.getComboNumberTextures();
      const overlap = skin.config.fonts.comboOverlap;
      comboNumber.prepare({ digits: calculateDigits(gameplayInfo.currentCombo), textures, overlap });
      comboNumber.position.set(0, STAGE_HEIGHT - 50);
      this.container.addChild(comboNumber);
    }
  }

  updateHUD() {
    this.container.removeChildren();
    this.updateComboNumber();
    this.updateAccuracy();
    this.updateHitErrorBar();
    this.updateStats();
    this.updateOverlays();
  }

  private updateAccuracy() {
    const skin = this.skinManager.getSkin();
    const gameplayInfo = this.gameSimulator.getCurrentInfo();
    if (gameplayInfo) {
      const accNumber = new OsuClassicAccuracy();
      const digitTextures = skin.getScoreTextures();
      const dotTexture = skin.getTexture("SCORE_DOT");
      const percentageTexture = skin.getTexture("SCORE_PERCENT");
      const overlap = skin.config.fonts.scoreOverlap;
      accNumber.prepare({ accuracy: gameplayInfo.accuracy, digitTextures, dotTexture, percentageTexture, overlap });
      accNumber.container.position.set(STAGE_WIDTH - 15, 25);
      this.container.addChild(accNumber.container);
    }
  }

  private updateStats() {
    const gameplayInfo = this.gameSimulator.getCurrentInfo();
    const gameplayState = this.gameSimulator.getCurrentState();
    const time = this.gameplayClock.timeElapsedInMs;

    if (gameplayInfo && gameplayState) {
      const count = gameplayInfo.verdictCounts;
      const maxCombo = gameplayInfo.maxComboSoFar;

      const digits = 2;
      const globalMean = calculateMean(this.allHits);
      const globalDeviation = calculateUnstableRate(this.allHits);

      const localMean = calculateMean(this.recentHits);
      const localDeviation = calculateUnstableRate(this.recentHits);

      this.stats.text = `Time: ${formatGameTime(time, true)}
300: ${count[0]}
100: ${count[1]}
50: ${count[2]}
Misses: ${count[3]}

MaxCombo: ${maxCombo}

Global
UR: ${globalDeviation.toFixed(digits)}
Mean: ${globalMean.toFixed(digits)}ms

Local
UR: ${localDeviation.toFixed(digits)}
Mean: ${localMean.toFixed(digits)}ms
`;

      if (this.showStats) {
        this.stats.position.set(25, 50);
        this.container.addChild(this.stats);
      }
    }
  }
}
