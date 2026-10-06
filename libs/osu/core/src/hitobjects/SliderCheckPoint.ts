import { Slider } from "./Slider";
import { Position, Vec2 } from "@osujs/math";
import { HasHitTime, HasId, HasPosition } from "./Properties";
import { SliderCheckPointType } from "./Types";

export class SliderCheckPoint implements HasId, HasPosition, HasHitTime {
  constructor(public readonly slider: Slider) {}

  id = "";
  type: SliderCheckPointType = "TICK";
  spanIndex = 0;
  spanProgress = 0;
  spanStartTime = 0;
  offset: Position = { x: 0, y: 0 };

  hitTime = 0;

  get position(): Position {
    return Vec2.add(this.slider.startPosition, this.offset);
  }

  get scale(): number {
    return this.slider.scale;
  }
}
