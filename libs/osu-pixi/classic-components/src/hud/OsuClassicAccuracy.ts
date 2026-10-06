import { Container, Sprite, Texture } from "pixi.js";
import { OsuClassicNumber } from "./OsuClassicNumber";
import { calculateAccuracyDigits } from "../utils/numbers";

interface OsuClassicAccuracySettings {
  accuracy: number;
  overlap: number;
  digitTextures: Texture[];
  dotTexture: Texture;
  percentageTexture: Texture;
}

export class OsuClassicAccuracy {
  container: Container;
  beforeNumber: OsuClassicNumber;
  afterNumber: OsuClassicNumber;
  dotSprite: Sprite;
  percentageSprite: Sprite;

  constructor() {
    this.beforeNumber = new OsuClassicNumber();
    this.afterNumber = new OsuClassicNumber();
    this.dotSprite = new Sprite();
    this.percentageSprite = new Sprite();
    this.container = new Container();
    this.container.addChild(this.beforeNumber, this.dotSprite, this.afterNumber, this.percentageSprite);
  }

  prepare(settings: OsuClassicAccuracySettings) {
    const { accuracy, overlap, digitTextures, percentageTexture, dotTexture } = settings;
    const [beforeDigits, afterDigits] = calculateAccuracyDigits(accuracy);
    this.beforeNumber.prepare({ digits: beforeDigits, overlap, textures: digitTextures });
    this.afterNumber.prepare({ digits: afterDigits, overlap, textures: digitTextures });
    this.dotSprite.texture = dotTexture;
    this.percentageSprite.texture = percentageTexture;

    let width = 0;

    for (let i = 0; i < this.container.children.length; i++) {
      const c = this.container.children[i] as Container;
      const applyOverlap = i > 0 ? -overlap : 0;
      c.position.set(width + applyOverlap, 0);
      width += c.width + applyOverlap;
    }

    for (let i = 0; i < this.container.children.length; i++) {
      const c = this.container.children[i] as Container;
      c.position.set(c.position.x - width, 0);
    }
  }
}
