import { GameState } from "./GameState";
import { HitObjectType, SliderCheckPointType } from "../hitobjects/Types";
import { MainHitObjectVerdict } from "./Verdicts";
import { Beatmap } from "../beatmap/Beatmap";
import { HitCircle } from "../hitobjects/HitCircle";
import { Slider } from "../hitobjects/Slider";
import { SliderCheckPoint } from "../hitobjects/SliderCheckPoint";

export interface GameplayInfo {
  accuracy: number;
  verdictCounts: number[];
  score: number;
  currentCombo: number;
  maxComboSoFar: number;
}

interface ReplayComboInformation {
  currentCombo: number;
  maxComboSoFar: number;
}

type ReplayJudgementCounts = number[];

function updateComboInfo(combo: ReplayComboInformation, type: HitObjectType | SliderCheckPointType, hit: boolean) {
  let currentCombo = combo.currentCombo;
  switch (type) {
    case "HIT_CIRCLE":
    case "TICK":
    case "REPEAT":
    case "SPINNER":
      currentCombo = hit ? currentCombo + 1 : 0;
      break;

    case "LAST_LEGACY_TICK":
      currentCombo += hit ? 1 : 0;
      break;

    case "SLIDER":
      break;
  }

  return { currentCombo, maxComboSoFar: Math.max(combo.maxComboSoFar, currentCombo) };
}

export function osuStableAccuracy(count: number[]): number | undefined {
  if (count.length !== 4) {
    return undefined;
  }
  const JudgementScores = [300, 100, 50, 0];

  let perfect = 0,
    actual = 0;
  for (let i = 0; i < count.length; i++) {
    actual += JudgementScores[i] * count[i];
    perfect += JudgementScores[0] * count[i];
  }

  if (perfect === 0) {
    return undefined;
  }

  return actual / perfect;
}

interface EvaluationOption {
  scoringSystem: "ScoreV1" | "ScoreV2";
}

const defaultEvaluationOptions = {
  scoringSystem: "ScoreV1",
} as EvaluationOption;

type StableVerdictCount = Record<MainHitObjectVerdict, number>;

export const defaultGameplayInfo: GameplayInfo = Object.freeze({
  currentCombo: 0,
  maxComboSoFar: 0,
  verdictCounts: [0, 0, 0, 0],
  accuracy: 0,
  score: 0,
});

export class GameplayInfoEvaluator {
  options: EvaluationOption;
  judgedObjectsIndex: number;
  comboInfo: ReplayComboInformation;
  verdictCount: StableVerdictCount;

  constructor(private beatmap: Beatmap, options?: Partial<EvaluationOption>) {
    this.options = { ...defaultEvaluationOptions, ...options };
    this.comboInfo = { maxComboSoFar: 0, currentCombo: 0 };
    this.verdictCount = { MISS: 0, MEH: 0, GREAT: 0, OK: 0 };
    this.judgedObjectsIndex = 0;
  }

  evaluateHitObject(hitObjectType: HitObjectType, verdict: MainHitObjectVerdict, isSliderHead?: boolean) {
    this.comboInfo = updateComboInfo(this.comboInfo, hitObjectType, verdict !== "MISS");
    if (!isSliderHead) {
      this.verdictCount[verdict] += 1;
    }
  }

  evaluateSliderCheckpoint(hitObjectType: SliderCheckPointType, hit: boolean) {
    this.comboInfo = updateComboInfo(this.comboInfo, hitObjectType, hit);
  }

  countAsArray() {
    return (["GREAT", "OK", "MEH", "MISS"] as const).map((v) => this.verdictCount[v]);
  }

  evaluateReplayState(replayState: GameState): GameplayInfo {
    if (this.judgedObjectsIndex >= replayState.judgedObjects.length + 1) {
      this.comboInfo = { maxComboSoFar: 0, currentCombo: 0 };
      this.verdictCount = { MISS: 0, MEH: 0, GREAT: 0, OK: 0 };
      this.judgedObjectsIndex = 0;
    }

    while (this.judgedObjectsIndex < replayState.judgedObjects.length) {
      const id = replayState.judgedObjects[this.judgedObjectsIndex++];
      const hitObject = this.beatmap.getHitObject(id);
      if (hitObject instanceof SliderCheckPoint) {
        const hit = replayState.checkPointVerdict[hitObject.id].hit;
        this.evaluateSliderCheckpoint(hitObject.type, hit);
      } else if (hitObject instanceof HitCircle) {
        const verdict = replayState.hitCircleVerdict[id].type;
        const isSliderHead = hitObject.sliderId !== undefined;
        this.evaluateHitObject(hitObject.type, verdict, isSliderHead);
      } else if (hitObject instanceof Slider) {
        const verdict = replayState.sliderVerdict[hitObject.id];
        this.evaluateHitObject(hitObject.type, verdict);
      } else {
        this.evaluateHitObject("SPINNER", "GREAT");
      }
    }

    const counts = this.countAsArray();
    return {
      score: 0,
      verdictCounts: counts,
      accuracy: osuStableAccuracy(counts) ?? 1.0,
      currentCombo: this.comboInfo.currentCombo,
      maxComboSoFar: this.comboInfo.maxComboSoFar,
    };
  }
}
