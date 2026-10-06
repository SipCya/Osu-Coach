import { Graphics } from "pixi.js";
import { circleSizeToScale } from "@osujs/math";
import { OSU_PLAYFIELD_HEIGHT, OSU_PLAYFIELD_WIDTH } from "../utils/constants";

export interface PlayfieldBorderSettings {
  enabled: boolean;
  thickness: number;
}

const cs4 = circleSizeToScale(4) * 64;
const DEFAULT_COLOR = 0xffffff;
const DEFAULT_ALPHA = 0.7;

export class PlayfieldBorder {
  graphics: Graphics;

  constructor() {
    this.graphics = new Graphics();
  }

  onSettingsChange(settings: PlayfieldBorderSettings) {
    const { thickness, enabled } = settings;

    this.graphics.clear();

    if (enabled) {
      this.graphics.lineStyle(thickness, DEFAULT_COLOR, DEFAULT_ALPHA);
      const offsetX = cs4;
      const offsetY = cs4 / (4.0 / 3);

      this.graphics.drawRect(-offsetX, -offsetY, OSU_PLAYFIELD_WIDTH + offsetX * 2, OSU_PLAYFIELD_HEIGHT + offsetY * 2);
    }
  }
}
