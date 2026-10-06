import { Position, Vec2 } from "@osujs/math";
import { MainHitObjectVerdict } from "./Verdicts";

export const NOT_PRESSING = +727727727;

export type PressingSinceTimings = number[];

const HitCircleMissReasons = [
  "TIME_EXPIRED",
  "HIT_TOO_EARLY",
  "FORCE_MISS_NOTELOCK",
  "SLIDER_FINISHED_FASTER",
] as const;

export type HitCircleMissReason = typeof HitCircleMissReasons[number];

export type HitCircleVerdict = {
  judgementTime: number;
} & ({ type: "GREAT" | "MEH" | "OK" } | { type: "MISS"; missReason: HitCircleMissReason });

export type CheckPointState = {
  hit: boolean;
};

export type SliderBodyState = {
  isTracking: boolean;
};

export type SpinnerState = {
  totalSpunAngle: number;

  currentAngle: number;
};

export interface GameState {
  currentTime: number;
  cursorPosition: Position;

  eventIndex: number;

  hitCircleVerdict: Record<string, HitCircleVerdict>;
  checkPointVerdict: Record<string, CheckPointState>;
  sliderVerdict: Record<string, MainHitObjectVerdict>;

  spinnerState: Map<string, SpinnerState>;
  sliderBodyState: Map<string, SliderBodyState>;

  clickWasUseful: boolean;

  judgedObjects: Array<string>;

  latestHitObjectIndex: number;
  aliveHitCircleIds: Set<string>;
  aliveSliderIds: Set<string>;
  aliveSpinnerIds: Set<string>;

  pressingSince: PressingSinceTimings;
}

export const defaultGameState = (): GameState => ({
  eventIndex: 0,
  currentTime: 0,
  cursorPosition: Vec2.Zero,
  hitCircleVerdict: {},
  sliderBodyState: new Map<string, SliderBodyState>(),
  checkPointVerdict: {},
  spinnerState: new Map<string, SpinnerState>(),
  sliderVerdict: {},

  clickWasUseful: false,
  latestHitObjectIndex: 0 as number,
  aliveHitCircleIds: new Set<string>(),
  aliveSliderIds: new Set<string>(),
  aliveSpinnerIds: new Set<string>(),
  judgedObjects: [],
  pressingSince: [NOT_PRESSING, NOT_PRESSING],
});

export function cloneGameState(replayState: GameState): GameState {
  const {
    aliveHitCircleIds,
    aliveSliderIds,
    aliveSpinnerIds,
    spinnerState,
    sliderBodyState,
    checkPointVerdict,
    hitCircleVerdict,
    sliderVerdict,
    eventIndex,
    clickWasUseful,
    currentTime,
    cursorPosition,
    latestHitObjectIndex,
    pressingSince,
    judgedObjects,
  } = replayState;
  return {
    eventIndex: eventIndex,
    aliveHitCircleIds: new Set<string>(aliveHitCircleIds),
    aliveSliderIds: new Set<string>(aliveSliderIds),
    aliveSpinnerIds: new Set<string>(aliveSpinnerIds),
    hitCircleVerdict: { ...hitCircleVerdict },
    sliderVerdict: { ...sliderVerdict },
    checkPointVerdict: { ...checkPointVerdict },
    currentTime: currentTime,
    cursorPosition: cursorPosition,
    latestHitObjectIndex: latestHitObjectIndex,
    judgedObjects: [...judgedObjects],
    clickWasUseful: clickWasUseful,
    sliderBodyState: new Map<string, SliderBodyState>(sliderBodyState),
    spinnerState: new Map<string, SpinnerState>(spinnerState),
    pressingSince: pressingSince.slice(),
  };
}
