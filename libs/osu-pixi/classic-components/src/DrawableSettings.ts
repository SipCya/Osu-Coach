import { Position } from "@osujs/math";

export interface AnimationTimeSetting {
  time: number;
}

export interface ModHiddenSetting {
  modHidden: boolean;
}
export interface PositionSetting {
  position: Position;
}

export interface ScaleSetting {
  scale: number;
}

export interface TintSetting {
  tint: number;
}

export type HitResult = {
  hit: boolean;
  timing: number;
};
export type HitResultSetting = {
  hitResult?: HitResult;
};
