import { injectable } from "inversify";
import { PixiRendererManager } from "../../PixiRendererManager";
import { Position, RGB } from "@osujs/math";
import { BasicSliderTextureRenderer } from "@osucoach/osu-pixi/classic-components";
import { Texture } from "pixi.js";

type SliderTextureJob = {
  id: string;
  points: Position[];
  radius: number;
  borderColor: RGB;
  resolution: number;
};

@injectable()
export class SliderTextureManager {
  textures: Map<string, Texture>;

  constructor(private readonly pixiRendererService: PixiRendererManager) {
    this.textures = new Map<string, Texture>();
  }

  getTexture(settings: SliderTextureJob): Texture {
    const { id, points, radius, borderColor, resolution } = settings;
    const texture = this.textures.get(id);
    if (texture !== undefined) {
      return texture;
    }

    const pixiRenderer = this.pixiRendererService.getRenderer();
    if (pixiRenderer === undefined) {
      throw Error("Could not render slider texture without a renderer in place.");
    }
    const sliderTextureRenderer: BasicSliderTextureRenderer = new BasicSliderTextureRenderer(pixiRenderer);
    const renderTexture = sliderTextureRenderer.render({
      path: points,
      radius,
      resolution,
      borderColor,
    });
    this.textures.set(id, renderTexture);
    return renderTexture;
  }

  removeFromCache(id: string) {
    const texture = this.textures.get(id);
    if (texture !== undefined) {
      texture.destroy();
      this.textures.delete(id);
    }
  }
}
