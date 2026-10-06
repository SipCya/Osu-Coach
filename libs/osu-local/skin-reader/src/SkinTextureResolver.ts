import {
  comboDigitFonts,
  DEFAULT_SKIN_TEXTURE_CONFIG,
  defaultDigitFonts,
  hitCircleDigitFonts,
  OsuSkinTextures,
  SkinConfig,
} from "@osucoach/osu/skin";
import { promises as fs } from "fs";
import * as Path from "path";

export type GetTextureFileOption = {
  hdIfExists?: boolean;
  animatedIfExists?: boolean;
  tryWithFallback?: boolean;
};

export type OsuFileNameOptions = {
  useHD: boolean;
  extension: string;
  animationIndex?: number;
};

export type TextureFileLocation = {
  key: string;
  paths: string[];
};

export interface OsuSkinTextureResolver {
  resolve(osuSkinTexture: OsuSkinTextures, option: GetTextureFileOption): Promise<string[]>;
}

const join = Path.posix.join;

export class OsuLegacySkinTextureResolver implements OsuSkinTextureResolver {
  constructor(readonly folderPath: string, readonly config: SkinConfig) {}

  getFontPrefix(skinTexture: OsuSkinTextures): string | undefined {
    const { hitCirclePrefix, comboPrefix, scorePrefix } = this.config.fonts;

    const combine = (prefix: string, id: number) => `${prefix}-${id}`;
    {
      const hitCircleId = hitCircleDigitFonts.indexOf(skinTexture as any);
      if (hitCircleId !== -1) {
        return combine(hitCirclePrefix, hitCircleId);
      }
    }
    {
      const comboId = comboDigitFonts.indexOf(skinTexture as any);
      if (comboId !== -1) {
        return combine(comboPrefix, comboId);
      }
    }
    {
      const scoreId = defaultDigitFonts.indexOf(skinTexture as any);
      if (scoreId !== -1) {
        return combine(scorePrefix, scoreId);
      }
    }

    const texConfig = DEFAULT_SKIN_TEXTURE_CONFIG[skinTexture];
    switch (skinTexture) {
      case "SCORE_PERCENT":
      case "SCORE_DOT":
        return texConfig.filePrefix.replace("score", scorePrefix);
      case "SCORE_X":
        return texConfig.filePrefix.replace("score", comboPrefix);
    }

    return undefined;
  }

  getPrefix(skinTexture: OsuSkinTextures) {
    const fontPrefix = this.getFontPrefix(skinTexture);
    if (fontPrefix !== undefined) return fontPrefix;

    const texConfig = DEFAULT_SKIN_TEXTURE_CONFIG[skinTexture];
    if (!texConfig) {
      throw Error("what u doing");
    }
    return join(texConfig.filePrefix);
  }

  getFilename(skinTexture: OsuSkinTextures, opt: OsuFileNameOptions) {
    const { useHD, animationIndex, extension } = opt;
    const texConfig = DEFAULT_SKIN_TEXTURE_CONFIG[skinTexture];
    if (!texConfig) {
      throw Error("Config for given texture not found");
    }
    const { skipHyphen, animationFrameRate } = texConfig;
    let s = this.getPrefix(skinTexture);

    if (animationIndex !== undefined) {
      if (animationFrameRate === undefined) throw Error("Don't use animationIndex for a non animatable texture");
      if (!skipHyphen) s += "-";
      s += animationIndex;
    }
    if (useHD) {
      s += "@2x";
    }
    s += "." + extension;
    return s;
  }

  async checkForFileExistenceInFolder(fileName: string) {
    try {
      const file = await fs.stat(join(this.folderPath, fileName));
      return file.isFile();
    } catch (err) {
      return false;
    }
  }

  async checkForFirstAppearanceInFolder(fileNames: string[]) {
    for (const f of fileNames) {
      const exists = await this.checkForFileExistenceInFolder(f);
      if (exists) {
        return f;
      }
    }
    return null;
  }

  async checkForTextureWithFallback(skinTexture: OsuSkinTextures, options: OsuFileNameOptions) {
    const filesToCheck = [this.getFilename(skinTexture, options)];
    if (options.useHD) filesToCheck.push(this.getFilename(skinTexture, { ...options, useHD: false }));
    return this.checkForFirstAppearanceInFolder(filesToCheck);
  }

  async resolve(skinTexture: OsuSkinTextures, option: GetTextureFileOption = {}): Promise<string[]> {
    const { animatedIfExists, hdIfExists } = option;
    const texConfig = DEFAULT_SKIN_TEXTURE_CONFIG[skinTexture];
    if (!texConfig) {
      throw Error(`Skin texture ${skinTexture} not found in config`);
    }
    const extension = "png";

    const tryWithAnimation = animatedIfExists && texConfig.animationFrameRate !== undefined;
    if (tryWithAnimation) {
      let animationIndex = 0;
      const files: string[] = [];
      while (animationIndex < 727) {
        const file = await this.checkForTextureWithFallback(skinTexture, {
          useHD: hdIfExists ?? false,
          extension: "png",
          animationIndex,
        });
        if (file === null) {
          break;
        }
        animationIndex += 1;
        files.push(file);
      }
      if (files.length > 0) return files;
    }
    const defaultFile = await this.checkForTextureWithFallback(skinTexture, {
      useHD: hdIfExists ?? false,
      extension,
    });
    if (defaultFile) {
      return [defaultFile];
    }
    if (texConfig.animationFrameRate !== undefined) {
      const fallbackFirstAnimationFile = await this.checkForTextureWithFallback(skinTexture, {
        useHD: hdIfExists ?? false,
        extension,
        animationIndex: 0,
      });
      if (fallbackFirstAnimationFile) {
        return [fallbackFirstAnimationFile];
      }
    }

    return [];
  }
}
