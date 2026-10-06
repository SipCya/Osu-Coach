import { posix } from "path";
import { promises as fs } from "fs";
import { generateDefaultSkinConfig, parseSkinIni } from "@osucoach/osu/skin";
import { OsuLegacySkinTextureResolver } from "./SkinTextureResolver";

const join = posix.join;

const SKIN_CONFIG_FILENAME = "skin.ini";

interface ListSkinsInFolderOptions {
  skinIniRequired: boolean;
}

const defaultListingOptions: ListSkinsInFolderOptions = {
  skinIniRequired: true,
};

export class SkinFolderReader {
  static async listSkinsInFolder(
    skinsFolderPath: string,
    options?: Partial<ListSkinsInFolderOptions>,
  ): Promise<string[]> {
    const { skinIniRequired } = { ...defaultListingOptions, ...options };

    const files = await fs.readdir(skinsFolderPath, { withFileTypes: true });
    const results = await Promise.all(
      files.map(async (f) => {
        if (!f.isDirectory()) return null;

        if (!skinIniRequired) return f.name;

        const skinConfigFile = join(skinsFolderPath, f.name, SKIN_CONFIG_FILENAME);
        try {
          const file = await fs.stat(skinConfigFile);
          return file.isFile() ? f.name : null;
        } catch (err) {
          return null;
        }
      }),
    );
    return results.filter((f) => f !== null) as string[];
  }

  static async getSkinResolver(skinFolderPath: string): Promise<OsuLegacySkinTextureResolver> {
    let config;
    try {
      const data = await fs.readFile(join(skinFolderPath, SKIN_CONFIG_FILENAME), { encoding: "utf-8" });
      config = parseSkinIni(data);
    } catch (err) {
      config = generateDefaultSkinConfig(false);
    }
    return new OsuLegacySkinTextureResolver(skinFolderPath, config);
  }
}
