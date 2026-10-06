import { Sprite, Texture } from "pixi.js";
import {
  createCenteredSprite,
  DisplayObjectTransformationProcess,
  evaluateTransformationsToProperties,
} from "../utils/Pixi";
import { AnimationTimeSetting, PositionSetting, ScaleSetting } from "../DrawableSettings";
import { PrepareSetting } from "../utils/Preparable";
import { fadeInT, fadeOutT, scaleToT, Transformation } from "../utils/Transformations";
import { Easing } from "@osujs/math";

interface OsuClassicSliderRepeatSettings extends PositionSetting, ScaleSetting, AnimationTimeSetting {
  time: number;
  texture: Texture;
  rotationAngle: number;
  approachDuration: number;
  fadeInOutDuration: number;
  beatLength: number;
  hit: boolean | null;
}

const defaultSettings: OsuClassicSliderRepeatSettings = {
  time: 0,
  scale: 0.57,
  position: { x: 0, y: 0 },
  texture: Texture.EMPTY,
  rotationAngle: 0,
  approachDuration: 450,
  fadeInOutDuration: 300,
  hit: null,
  beatLength: 500,
};

export class OsuClassicSliderRepeat implements PrepareSetting<OsuClassicSliderRepeatSettings> {
  sprite: Sprite;
  settings: OsuClassicSliderRepeatSettings;

  constructor() {
    this.sprite = createCenteredSprite();
    this.settings = defaultSettings;
  }

  static normalTransformation(settings: {
    hit: boolean | null;
    scale: number;
    approachDuration: number;
    fadeInOutDuration: number;
    beatLength: number;
  }): DisplayObjectTransformationProcess {
    const { hit, scale, approachDuration, fadeInOutDuration, beatLength } = settings;

    const usedBeatLength = Math.min(beatLength, 200);
    const scalingTransformations: Transformation<number>[] = [];
    const hitTiming = 0;
    let t = -approachDuration;
    while (t < hitTiming) {
      scalingTransformations.push({ time: [t, t + usedBeatLength - 1], func: scaleToT(1.0 * scale, Easing.OUT) });
      scalingTransformations.push({ time: [t + usedBeatLength - 1, t], func: scaleToT(1.3 * scale, Easing.OUT) });
      t += usedBeatLength;
    }

    const alphaTransformations: Transformation<number>[] = [
      {
        time: [-approachDuration, -approachDuration + fadeInOutDuration],
        func: fadeInT(),
      },
    ];

    if (hit !== null) {
      if (hit) {
        alphaTransformations.push({ time: [hitTiming, hitTiming + fadeInOutDuration], func: fadeOutT() });
      } else {
        alphaTransformations.push({
          time: [hitTiming, hitTiming + fadeInOutDuration],
          func: fadeOutT(0, Easing.OUT),
        });
      }
    }

    return {
      alpha: {
        startValue: 0,
        transformations: alphaTransformations,
      },
      scale: {
        startValue: 1.3 * scale,
        transformations: scalingTransformations,
      },
    };
  }

  prepare(setting: Partial<OsuClassicSliderRepeatSettings>): void {
    this.settings = { ...this.settings, ...setting };
    const { rotationAngle, texture, position, scale, hit, fadeInOutDuration, approachDuration, beatLength, time } =
      this.settings;

    this.sprite.anchor.set(0.5);
    this.sprite.texture = texture;
    this.sprite.position.set(position.x, position.y);
    this.sprite.rotation = rotationAngle;

    const props = evaluateTransformationsToProperties(
      OsuClassicSliderRepeat.normalTransformation({
        approachDuration,
        beatLength,
        fadeInOutDuration,
        hit,
        scale,
      }),
      time,
    );

    this.sprite.alpha = props.alpha as number;
    this.sprite.scale.set(props.scale as number);
  }
}
