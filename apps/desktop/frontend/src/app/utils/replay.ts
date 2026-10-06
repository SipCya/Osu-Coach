import { OsuAction, ReplayFrame } from "@osujs/core";
import { Position, Vec2 } from "@osujs/math";

export function findIndexInReplayAtTime(replay: ReplayFrame[], time: number): number {
  let lo = 0;
  let hi = replay.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (replay[mid].time <= time) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo - 1;
}

export function interpolateReplayPosition(fA: ReplayFrame, fB: ReplayFrame, time: number): Position {
  if (fB.time === fA.time) {
    return fA.position;
  } else {
    const p = (time - fA.time) / (fB.time - fA.time);
    return Vec2.interpolate(fA.position, fB.position, p);
  }
}

export const getPressesBooleanArray = (actions: OsuAction[]): [boolean, boolean] => {
  return [OsuAction.leftButton, OsuAction.rightButton].map((b) => actions.includes(b)) as [boolean, boolean];
};
