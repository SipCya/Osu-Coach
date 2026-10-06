import { Container, Sprite, Texture } from "pixi.js";

export type OsuClassicNumberSettings = {
  digits: number[];
  textures: Texture[];
  overlap: number;
};

export const DEFAULT_NUMBER_TEXTURES: Texture[] = Array(10).fill(Texture.EMPTY);

const DEFAULT_NUMBER_SETTINGS: OsuClassicNumberSettings = {
  digits: [0],
  textures: DEFAULT_NUMBER_TEXTURES,
  overlap: 0,
};

export class OsuClassicNumber extends Container {
  private lastNumber: number[] = [];
  private settings: OsuClassicNumberSettings;

  constructor() {
    super();
    this.settings = DEFAULT_NUMBER_SETTINGS;
  }

  _anchorX = 0;
  _anchorY = 0;

  set anchorX(value) {
    this._anchorX = value;
    this.pivot.x = (value * this.width) / this.scale.x;
  }

  get anchorX() {
    return this._anchorX;
  }

  set anchorY(value) {
    this._anchorY = value;
    this.pivot.y = (value * this.height) / this.scale.y;
  }

  get anchorY() {
    return this._anchorY;
  }

  prepare(settings: OsuClassicNumberSettings): void {
    this.settings = Object.freeze({ ...this.settings, ...settings });

    const { digits, overlap, textures } = this.settings;

    if (this.lastNumber === digits) {
      return;
    }

    this.lastNumber = digits;
    this.children.forEach((t) => t.destroy(true));
    this.removeChildren();

    let totalWidth = 0;
    const digitSprites: Sprite[] = [];

    for (let i = 0; i < digits.length; i++) {
      const digit = digits[i];
      const texture = textures[digit];
      const sprite = new Sprite(texture);
      const addOverlap = i > 0 ? -overlap : 0;
      sprite.anchor.set(0, 0);
      sprite.position.set(totalWidth + addOverlap, 0);
      totalWidth += texture.width + addOverlap;
      digitSprites.push(sprite);
    }
    this.addChild(...digitSprites);
  }
}
