import { Position } from "@osujs/math";
import { normalizeHitObjects } from "../utils";
import { GameState } from "./GameState";
import { Slider } from "../hitobjects/Slider";
import { HitCircle } from "../hitobjects/HitCircle";
import { MainHitObjectVerdict } from "./Verdicts";
import { OsuHitObject } from "../hitobjects/Types";

export type GameplayAnalysisEventType = "HitObjectJudgement" | "CheckpointJudgement" | "UnnecessaryClick";

interface DisplayBase {
  type: GameplayAnalysisEventType;
  time: number;
  position: Position;
}

type HitObjectVerdict = MainHitObjectVerdict;

export interface HitObjectJudgement extends DisplayBase {
  type: "HitObjectJudgement";
  verdict: HitObjectVerdict;
  hitObjectId: string;
  isSliderHead?: boolean;
}

export interface CheckpointJudgement extends DisplayBase {
  type: "CheckpointJudgement";
  hit: boolean;
  isLastTick?: boolean;
}

export interface UnnecessaryClick extends DisplayBase {
  type: "UnnecessaryClick";
}

export type ReplayAnalysisEvent = HitObjectJudgement | CheckpointJudgement | UnnecessaryClick;

export const isHitObjectJudgement = (h: ReplayAnalysisEvent): h is HitObjectJudgement =>
  h.type === "HitObjectJudgement";

export function retrieveEvents(gameState: GameState, hitObjects: OsuHitObject[]) {
  const events: ReplayAnalysisEvent[] = [];
  const dict = normalizeHitObjects(hitObjects);

  for (const id in gameState.hitCircleVerdict) {
    const state = gameState.hitCircleVerdict[id];
    const hitCircle = dict[id] as HitCircle;
    const isSliderHead = hitCircle.sliderId !== undefined;
    const verdict = state.type;
    events.push({
      type: "HitObjectJudgement",
      time: state.judgementTime,
      hitObjectId: id,
      position: hitCircle.position,
      verdict,
      isSliderHead,
    });
  }

  for (const id in gameState.sliderVerdict) {
    const verdict = gameState.sliderVerdict[id];
    const slider = dict[id] as Slider;
    const position = slider.endPosition;
    events.push({ time: slider.endTime, hitObjectId: id, position, verdict, type: "HitObjectJudgement" });

    for (const point of slider.checkPoints) {
      const checkPointState = gameState.checkPointVerdict[point.id];
      const hit = checkPointState?.hit ?? false;

      const isLastTick = point.type === "LAST_LEGACY_TICK";
      events.push({ time: slider.endTime, position: point.position, type: "CheckpointJudgement", hit, isLastTick });
    }
  }

  return events;
}
