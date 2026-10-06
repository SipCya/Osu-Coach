import { Position } from "@osujs/math";
import { PathControlPoint } from "../hitobjects/slider/PathControlPoint";

export type HitObjectSettingsType = "HIT_CIRCLE" | "SLIDER" | "SPINNER" | "MANIA_HOLD";

export interface HitObjectSettings {
  type: HitObjectSettingsType;
  position: Position;
  time: number;

  newCombo: boolean;
  comboSkip: number;
}

export interface HitCircleSettings extends HitObjectSettings {
  type: "HIT_CIRCLE";
}

export interface SliderSettings extends HitObjectSettings {
  type: "SLIDER";

  repeatCount: number;
  pathPoints: PathControlPoint[];
  length?: number;

  legacyLastTickOffset: number;

  tickDistanceMultiplier: 1;
}

export interface SpinnerSettings extends HitObjectSettings {
  type: "SPINNER";
  duration: number;
}
