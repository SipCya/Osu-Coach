import { PathType } from "./PathType";
import { Position } from "@osujs/math";

export type PathControlPoint = {
  type?: PathType;
  offset: Position;
};
