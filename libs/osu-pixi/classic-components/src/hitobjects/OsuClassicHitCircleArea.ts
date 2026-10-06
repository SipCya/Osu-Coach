import { Container } from "@pixi/display";
import { Texture } from "@pixi/core";
import { Sprite } from "@pixi/sprite";
import { OsuClassicNumber } from "../hud/OsuClassicNumber";
import {
  applyPropertiesToDisplayObject,
  createCenteredSprite,
  DisplayObjectTransformationProcess,
  evaluateTransformationsToProperties,
} from "../utils/Pixi";
import {
  AnimationTimeSetting,
  HitResult,
  ModHiddenSetting,
  PositionSetting,
  ScaleSetting,
  TintSetting,
} from "../DrawableSettings";
import { fadeInT, fadeOutT, scaleToT } from "../utils/Transformations";
import { OsuClassicConstants } from "./OsuClassicConstants";
import { PrepareSetting } from "../utils/Preparable";
import { Easing } from "@osujs/math";
import { calculateDigits } from "../utils/numbers";

export interface OsuClassicHitCircleAreaSettings
  extends AnimationTimeSetting,
    ModHiddenSetting,
    TintSetting,
    ScaleSetting,
    PositionSetting {
  number: number;
  numberOverlap: number;
  numberScaling: number;

  tint: number;

  hitCircleTexture: Texture;
  numberTextures: Texture[];
  hitCircleOverlayTexture: Texture;

  hitCircleOverlayAboveNumber: boolean;

  approachDuration: number;
  fadeInDuration: number;

  scale: number;

  hitResult: HitResult | null;
}

const DEFAULT_NUMBER_SCALING_IN_HIT_CIRCLE = 0.8;
const DEFAULT_NUMBER_TEXTURES: Texture[] = Array(10).fill(Texture.EMPTY);

const defaultSettings: OsuClassicHitCircleAreaSettings = {
  time: 0,
  modHidden: false,
  hitResult: null,

  number: 1,
  numberOverlap: 0,
  numberScaling: DEFAULT_NUMBER_SCALING_IN_HIT_CIRCLE,

  hitCircleOverlayTexture: Texture.EMPTY,
  numberTextures: DEFAULT_NUMBER_TEXTURES,
  hitCircleTexture: Texture.EMPTY,

  tint: 0x111111,
  hitCircleOverlayAboveNumber: true,
  approachDuration: 450,
  scale: 0.57,
  position: { x: 0, y: 0 },
  fadeInDuration: OsuClassicConstants.DEFAULT_FADE_IN_DURATION,
};

export class OsuClassicHitCircleArea implements PrepareSetting<OsuClassicHitCircleAreaSettings> {
  public container: Container;
  private hitCircleSprite: Sprite;
  private readonly number: OsuClassicNumber;
  private hitCircleOverlaySprite: Sprite;

  private settings: OsuClassicHitCircleAreaSettings;

  constructor(settings?: Partial<OsuClassicHitCircleAreaSettings>) {
    this.container = new Container();
    this.container.addChild((this.hitCircleSprite = createCenteredSprite()));
    this.container.addChild((this.number = new OsuClassicNumber()));
    this.container.addChild((this.hitCircleOverlaySprite = createCenteredSprite()));
    this.settings = Object.freeze({ ...defaultSettings, ...settings });
  }

  private prepareHitCircleSprites(): void {
    const { hitCircleTexture, hitCircleOverlayTexture, tint } = this.settings;
    this.hitCircleSprite.texture = hitCircleTexture;
    this.hitCircleOverlaySprite.texture = hitCircleOverlayTexture;
    this.hitCircleSprite.tint = tint;
  }

  private prepareNumber(): void {
    const { number, numberTextures: textures, numberOverlap: overlap, scale } = this.settings;
    const hideNumber = false;
    if (hideNumber) this.number.renderable = false;
    this.number.prepare({ digits: calculateDigits(number), textures, overlap });
    this.number.anchorX = 0.5;
    this.number.anchorY = 0.5;
  }

  private prepareSpriteOrder(): void {
    const { hitCircleOverlayAboveNumber } = this.settings;
    this.hitCircleSprite.zIndex = 0;
    if (hitCircleOverlayAboveNumber) {
      this.number.zIndex = 1;
      this.hitCircleOverlaySprite.zIndex = 2;
    } else {
      this.hitCircleOverlaySprite.zIndex = 1;
      this.number.zIndex = 2;
    }
    this.container.sortChildren();
  }

  private animateHitCircleSprites(): void {
    const { time, hitResult } = this.settings;
    const props = evaluateTransformationsToProperties(hitCircleSpritesTransform(hitResult), time, {
      alpha: 1.0,
      scale: 1.0,
    });
    [this.hitCircleSprite, this.hitCircleOverlaySprite].forEach((s) => applyPropertiesToDisplayObject(props, s));
  }

  private animateNumber(): void {
    const { time, numberScaling, hitResult } = this.settings;
    const props = evaluateTransformationsToProperties(numberTransform(hitResult), time, {
      alpha: 1.0,
      scale: numberScaling,
    });
    applyPropertiesToDisplayObject(props, this.number);
  }

  private animateSelf(): void {
    const { time, hitResult, modHidden, approachDuration, fadeInDuration, scale, position } = this.settings;
    const transforms = modHidden
      ? hiddenHitCircleTransforms(approachDuration)
      : normalHitCircleTransforms(approachDuration, fadeInDuration, hitResult);
    const thisProps = evaluateTransformationsToProperties(transforms, time, { alpha: 1.0, scale, position });
    applyPropertiesToDisplayObject(thisProps, this.container);
  }

  private animate(): void {
    this.animateHitCircleSprites();
    this.animateNumber();
    this.animateSelf();
  }

  prepare(settings: Partial<OsuClassicHitCircleAreaSettings>): void {
    this.settings = Object.freeze({ ...this.settings, ...settings });
    this.prepareSpriteOrder();
    this.prepareNumber();
    this.prepareHitCircleSprites();
    this.animate();
  }
}

function numberTransform(hitResult: HitResult | null): DisplayObjectTransformationProcess {
  if (!hitResult || !hitResult.hit) {
    return {};
  }
  const { timing } = hitResult;
  return {
    alpha: {
      startValue: 1,
      transformations: [
        {
          time: [timing, timing + OsuClassicConstants.LEGACY_FADE_OUT_DURATION / 4],
          func: fadeOutT(0, Easing.OUT),
        },
      ],
    },
  };
}

function normalHitCircleTransforms(
  approachDuration: number,
  fadeInDuration: number,
  hitResult: HitResult | null,
): DisplayObjectTransformationProcess {
  const delay = 800;
  const supposedToHitTime = 0;
  const hit = hitResult && hitResult.hit;
  return {
    alpha: {
      startValue: 0,
      transformations: [
        { time: [-approachDuration, -approachDuration + fadeInDuration], func: fadeInT() },
        hit
          ? { time: [supposedToHitTime + delay, supposedToHitTime + delay + 1], func: fadeOutT() }
          : { time: [supposedToHitTime, supposedToHitTime + 100], func: fadeOutT() },
      ],
    },
  };
}

function hiddenHitCircleTransforms(approachDuration: number): DisplayObjectTransformationProcess {
  const fadeInDuration = approachDuration * OsuClassicConstants.fadeInDurationMultiplier;
  const fadeOutDuration = approachDuration * OsuClassicConstants.fadeOutDurationMultiplier;
  const fullyFadedInTime = -approachDuration + fadeInDuration;
  return {
    alpha: {
      startValue: 0,
      transformations: [
        { time: [-approachDuration, -approachDuration + fadeInDuration], func: fadeInT() },
        { time: [fullyFadedInTime, fullyFadedInTime + fadeOutDuration], func: fadeOutT() },
      ],
    },
  };
}

function hitCircleSpritesTransform(hitResult: HitResult | null): DisplayObjectTransformationProcess {
  if (!hitResult || !hitResult.hit) {
    return {};
  }
  const { timing } = hitResult;
  return {
    alpha: {
      startValue: 1,
      transformations: [
        {
          time: [timing, timing + OsuClassicConstants.LEGACY_FADE_OUT_DURATION],
          func: fadeOutT(0, Easing.OUT),
        },
      ],
    },
    scale: {
      startValue: 1,
      transformations: [
        {
          time: [timing, timing + OsuClassicConstants.LEGACY_FADE_OUT_DURATION],
          func: scaleToT(1.4, Easing.OUT),
        },
      ],
    },
  };
}
