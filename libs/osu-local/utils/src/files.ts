import { constants, promises } from "fs";
import { access, mkdir, readFile } from "fs/promises";
import { join, resolve } from "path";
import { osuUserConfigParse } from "./osuUserConfig";

const { readdir, stat } = promises;

export const fileLastModifiedTime = async (path: string): Promise<number> => {
  const s = await stat(path);
  return s.mtimeMs;
};

export const fileLastModifiedDate = async (path: string): Promise<Date> => {
  const s = await stat(path);
  return s.mtime;
};

const filterUndefined = (p: any) => p !== undefined;

export async function filterFilenamesInDirectory(
  dirName: string,
  condition: (fileName: string) => Promise<boolean>,
): Promise<string[]> {
  const fileNamesInFolder = await readdir(dirName);
  return (
    await Promise.all(
      fileNamesInFolder.map(async (fileName) => {
        if (await condition(fileName)) {
          return fileName;
        } else {
          return undefined;
        }
      }),
    )
  ).filter(filterUndefined) as string[];
}

async function createFolderIfNotExisting(folderPath: string) {
  try {
    await access(folderPath, constants.R_OK);
  } catch (err) {
    console.log(`Could not access the replays folder '${folderPath}'. Creating a new one`);
    return mkdir(folderPath);
  }
}

function osuUserConfigFileName(userName: string) {
  return `osu!.${userName}.cfg`;
}

export async function determineSongsFolder(osuFolderPath: string, userName: string) {
  const userConfigPath = join(osuFolderPath, osuUserConfigFileName(userName));

  try {
    const data = await readFile(userConfigPath, "utf-8");
    const records = osuUserConfigParse(data);
    const beatmapDirectory = records["BeatmapDirectory"];
    return resolve(osuFolderPath, beatmapDirectory);
  } catch (err) {
    return join(osuFolderPath, "Songs");
  }
}
