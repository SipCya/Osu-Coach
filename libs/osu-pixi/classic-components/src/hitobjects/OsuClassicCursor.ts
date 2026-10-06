import { PrepareSetting } from "../utils/Preparable";
import { Texture } from "pixi.js";
import { Container } from "@pixi/display";
import { Sprite } from "@pixi/sprite";
import { createCenteredSprite } from "../utils/Pixi";
import { Position } from "@osujs/math";

const MAX_CURSOR_TRAILS = 8;

export interface OsuClassicCursorSetting {
  position: Position;

  trailPositions: Position[];

  cursorScale: number;

  cursorTexture: Texture;
  cursorTrailTexture: Texture;
}

const defaultSettings: OsuClassicCursorSetting = {
  position: { x: 0, y: 0 },
  trailPositions: [],
  cursorScale: 1.0,
  cursorTexture: Texture.EMPTY,
  cursorTrailTexture: Texture.EMPTY,
};

export class OsuClassicCursor implements PrepareSetting<OsuClassicCursorSetting> {
  public container: Container;
  private readonly cursorSprite: Sprite;
  private readonly cursorTrailSprites: Sprite[];
  private settings: OsuClassicCursorSetting;

  constructor() {
    this.container = new Container();
    this.settings = defaultSettings;
    this.cursorSprite = createCenteredSprite();
    this.cursorTrailSprites = [];
    for (let i = 0; i < MAX_CURSOR_TRAILS; i++) this.cursorTrailSprites.push(createCenteredSprite());

    for (let i = 0; i < MAX_CURSOR_TRAILS; i++) {
      this.container.addChild(this.cursorTrailSprites[MAX_CURSOR_TRAILS - i - 1]);
    }
    this.container.addChild(this.cursorSprite);
    this.container.position.set(0, 0);
  }

  prepare(setting: Partial<OsuClassicCursorSetting>): void {
    this.settings = { ...this.settings, ...setting };

    const { cursorScale, cursorTexture, cursorTrailTexture, trailPositions, position } = this.settings;

    this.cursorSprite.texture = cursorTexture;

    this.cursorSprite.position.set(position.x, position.y);
    this.cursorSprite.scale.set(cursorScale);

    this.cursorTrailSprites.forEach((cts, i) => {
      cts.texture = cursorTrailTexture;
      if (i < trailPositions.length) {
        cts.position.set(trailPositions[i].x, trailPositions[i].y);
        cts.alpha = (trailPositions.length - i) / trailPositions.length;
        cts.scale.set(cursorScale);
      } else {
        cts.alpha = 0;
      }
    });
  }
}
