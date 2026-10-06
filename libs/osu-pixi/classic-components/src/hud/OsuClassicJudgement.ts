import { Sprite, Texture } from "pixi.js";
import { AnimationTimeSetting, PositionSetting, ScaleSetting } from "../DrawableSettings";
import { Easing, Position } from "@osujs/math";
import { PrepareSetting } from "../utils/Preparable";
import {
  applyPropertiesToDisplayObject,
  DisplayObjectTransformationProcess,
  evaluateTransformationsToProperties,
} from "../utils/Pixi";
import { fadeOutT, scaleToT } from "../utils/Transformations";
import { animationIndex } from "../utils/Animation";

export interface OsuClassicJudgementsSettings extends AnimationTimeSetting, PositionSetting, ScaleSetting {
  time: number;
  position: Position;
  scale: number;

  textures: Texture[];
  animationFrameRate: number;
}

const defaultSettings: OsuClassicJudgementsSettings = {
  time: 0,
  position: { x: 0, y: 0 },
  scale: 0.57,
  textures: [Texture.EMPTY],
  animationFrameRate: 60,
};

export class OsuClassicJudgement implements PrepareSetting<OsuClassicJudgementsSettings> {
  sprite: Sprite;
  settings: OsuClassicJudgementsSettings;

  constructor() {
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5, 0.5);
    this.settings = defaultSettings;
  }

  static normalTransformation(scale: number, position: Position): DisplayObjectTransformationProcess {
    return {
      alpha: {
        startValue: 1,
        transformations: [{ time: [0, 1000], func: fadeOutT() }],
      },
      scale: {
        startValue: scale * 0.9,
        transformations: [{ time: [0, 500], func: scaleToT(scale * 1.0, Easing.OUT_ELASTIC) }],
      },
      position: {
        startValue: position,
      },
    };
  }

  prepare(setting: Partial<OsuClassicJudgementsSettings>) {
    this.settings = { ...this.settings, ...setting };

    const { position, scale, textures, time, animationFrameRate } = this.settings;

    if (textures.length > 0) {
      const idx = Math.min(textures.length - 1, animationIndex(time, animationFrameRate));
      this.sprite.texture = textures[idx];
    } else {
      this.sprite.texture = Texture.EMPTY;
    }

    const props = evaluateTransformationsToProperties(OsuClassicJudgement.normalTransformation(scale, position), time);
    applyPropertiesToDisplayObject(props, this.sprite);
  }
}
