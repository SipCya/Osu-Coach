import { injectable } from "inversify";
import { Texture } from "pixi.js";

const AppTextures = ["BACKGROUND"] as const;

export type AppTextureId = typeof AppTextures[number];

@injectable()
export class TextureManager {
  dict: Map<AppTextureId, Texture> = new Map<AppTextureId, Texture>();

  getTexture(textureId: AppTextureId): Texture {
    const texture = this.dict.get(textureId);
    return texture ?? Texture.EMPTY;
  }

  async loadTexture(url: string) {
    try {
      return await Texture.fromURL(url);
    } catch (err) {
      return Texture.EMPTY;
    }
  }
}
