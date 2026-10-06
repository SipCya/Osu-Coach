import { HasId, HasSpawnTime } from "./Properties";

function diffRange(difficulty: number, min: number, mid: number, max: number) {
  if (difficulty > 5) return mid + ((max - mid) * (difficulty - 5)) / 5;
  if (difficulty < 5) return mid - ((mid - min) * (5 - difficulty)) / 5;

  return mid;
}

export class Spinner implements HasId, HasSpawnTime {
  id = "";
  startTime = 0;
  duration = 0;
  spinsRequired = 1;
  maximumBonusSpins = 1;

  get spawnTime(): number {
    return this.startTime;
  }

  get endTime(): number {
    return this.startTime + this.duration;
  }

  get type() {
    return "SPINNER";
  }
}
