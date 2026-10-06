import { Position, Vec2 } from "./Vec2";

export function sliderRepeatAngle(curve: Position[], isRepeatAtEnd: boolean): number {
  if (curve.length < 2) {
    return 0.0;
  }

  const searchStart = isRepeatAtEnd ? curve.length - 1 : 0;
  const searchDir = isRepeatAtEnd ? -1 : +1;
  const p1 = curve[searchStart];
  const p2 = curve[searchStart + searchDir];
  const direction = Vec2.sub(p2, p1);
  return Math.atan2(direction.y, direction.x);
}
