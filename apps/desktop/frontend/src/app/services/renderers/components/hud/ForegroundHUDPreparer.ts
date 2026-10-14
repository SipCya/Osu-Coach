import { injectable } from "inversify";
import { GameSimulator } from "../../../common/game/GameSimulator";
import { Container, Text } from "pixi.js";
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
import { Beatmap } from "@osujs/core";
import { calculateDifficultyAttributes, calculatePerformanceAttributes, DifficultyAttributes } from "@osujs/pp";

const OVERLAY_STYLE = { fontFamily: "Arial", fontWeight: "bold" as const, fill: 0xffffff, stroke: 0x000000 };

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
  ppText: Text;
  urText: Text;

  /** When false, the debug stats text is hidden (used for a clean osu!-like video export). */
  showStats = true;

  hitMinIndex = 0;
  hitMaxIndex = 0;

  allHits: number[] = [];
  recentHits: number[] = [];

  private ppMap: Beatmap | null = null;
  private ppAttrs: DifficultyAttributes | null = null;
  private ppCountsKey = "";
  private ppValue = 0;

  constructor(
    private readonly beatmapManager: BeatmapManager,
    private readonly skinManager: SkinHolder,
    private readonly gameSimulator: GameSimulator,
    private readonly gameplayClock: GameplayClock,
    private readonly hitErrorBarSettingsStore: HitErrorBarSettingsStore,
    private readonly hudOverlaySettingsStore: HudOverlaySettingsStore,
  ) {
    this.container = new Container();
    this.stats = new Text("", { fontSize: 16, fill: 0xeeeeee, fontFamily: "Arial", align: "left" });
    this.hitErrorBar = new OsuClassicHitErrorBar();
    this.ppText = new Text("", { ...OVERLAY_STYLE, fontSize: 30, strokeThickness: 4 });
    this.urText = new Text("", { ...OVERLAY_STYLE, fontSize: 22, strokeThickness: 3 });
  }

  private runningPp(): number {
    const beatmap = this.beatmapManager.getBeatmap();
    if (!beatmap || beatmap.hitObjects.length === 0) return 0;
    if (this.ppMap !== beatmap) {
      try {
        const list = calculateDifficultyAttributes(beatmap, true);
        this.ppAttrs = list[list.length - 1] ?? null;
      } catch {
        this.ppAttrs = null;
      }
      this.ppMap = beatmap;
      this.ppCountsKey = "";
      this.ppValue = 0;
    }
    if (!this.ppAttrs) return 0;
    const info = this.gameSimulator.getCurrentInfo();
    if (!info) return this.ppValue;
    const c = info.verdictCounts;
    const key = `${c[0]},${c[1]},${c[2]},${c[3]},${info.maxComboSoFar}`;
    if (key !== this.ppCountsKey) {
      try {
        this.ppValue = calculatePerformanceAttributes(this.ppAttrs, {
          mods: beatmap.appliedMods ?? [],
          maxCombo: info.maxComboSoFar,
          countGreat: c[0],
          countOk: c[1],
          countMeh: c[2],
          countMiss: c[3],
        }).total;
      } catch {
        /* keep last value on error */
      }
      this.ppCountsKey = key;
    }
    return this.ppValue;
  }

  updateOverlays() {
    const s = this.hudOverlaySettingsStore.settings;
    let y = 35;
    if (s.showPp) {
      this.ppText.text = `${Math.round(this.runningPp())}pp`;
      this.ppText.anchor.set(0.5, 0);
      this.ppText.position.set(STAGE_WIDTH / 2, y);
      this.container.addChild(this.ppText);
      y += 36;
    }
    if (s.showUr) {
      this.urText.text = `UR ${calculateUnstableRate(this.allHits).toFixed(0)}`;
      this.urText.anchor.set(0.5, 0);
      this.urText.position.set(STAGE_WIDTH / 2, y);
      this.container.addChild(this.urText);
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
