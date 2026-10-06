import { SliderPath } from "./slider/SliderPath";
import { Position, Vec2 } from "@osujs/math";
import { HitCircle } from "./HitCircle";
import { SliderCheckPoint } from "./SliderCheckPoint";
import { HasId } from "./Properties";
import { HitObjectType } from "./Types";

export class Slider implements HasId {
  static BASE_SCORING_DISTANCE = 100;

  id = "";

  head: HitCircle;

  path: SliderPath = new SliderPath([]);
  checkPoints: SliderCheckPoint[] = [];
  velocity = 1;
  tickDistance = 0;
  tickDistanceMultiplier = 1;
  legacyLastTickOffset?: number;
  repeatCount = 0;

  constructor(hitCircle: HitCircle) {
    this.head = hitCircle;
  }

  get type(): HitObjectType {
    return "SLIDER";
  }

  get spawnTime(): number {
    return this.head.spawnTime;
  }

  get spanCount(): number {
    return this.repeatCount + 1;
  }

  get scale(): number {
    return this.head.scale;
  }

  get radius(): number {
    return this.head.radius;
  }

  get spanDuration(): number {
    return this.duration / this.spanCount;
  }

  get duration(): number {
    return this.endTime - this.startTime;
  }

  get startTime(): number {
    return this.head.hitTime;
  }

  get endTime(): number {
    return this.startTime + (this.spanCount * this.path.distance) / this.velocity;
  }

  get startPosition(): Position {
    return this.head.position;
  }

  get endPosition(): Position {
    return Vec2.add(this.head.position, this.ballOffsetAt(1.0));
  }

  get unstackedEndPosition(): Position {
    return Vec2.add(this.head.unstackedPosition, this.ballOffsetAt(1.0));
  }

  ballPositionAt(progress: number): Position {
    return Vec2.add(this.head.position, this.ballOffsetAt(progress));
  }

  ballOffsetAt(progress: number): Position {
    const spanProgress = progress * this.spanCount;
    let progressInSpan = spanProgress % 1.0;
    if (Math.floor(spanProgress) % 2 === 1) {
      progressInSpan = 1.0 - progressInSpan;
    }
    return this.path.positionAt(progressInSpan);
  }
}
