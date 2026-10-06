import { promises as fsPromises } from "fs";
import { Blueprint, BlueprintSection, parseBlueprint } from "@osujs/core";
import { join } from "path";
import { createHash } from "crypto";
import { filterFilenamesInDirectory } from "@osucoach/osu-local/utils";
import { injectable } from "inversify";
import { OsuFolderService } from "./OsuFolderService";
import { BlueprintInfo } from "../../../model/BlueprintInfo";
import { OsuDBDao } from "./OsuDBDao";

const { stat, readFile } = fsPromises;

const METADATA_SECTIONS_TO_READ: BlueprintSection[] = ["General", "Difficulty", "Events", "Metadata"];

function mapToLocalBlueprint(
  blueprint: Blueprint,
  osuFileName: string,
  folderName: string,
  md5Hash: string,
): BlueprintInfo {
  const { metadata } = blueprint.blueprintInfo;
  return {
    creator: "",
    title: metadata.title,
    osuFileName,
    folderName,
    bgFileName: metadata.backgroundFile,
    md5Hash,
    audioFileName: metadata.audioFile,
    artist: metadata.artist,
    lastPlayed: new Date(),
  };
}

type BlueprintMD5 = string;

@injectable()
export class BlueprintLocatorService {
  private blueprints: Record<BlueprintMD5, BlueprintInfo> = {};
  private reading: Promise<Record<BlueprintMD5, BlueprintInfo>> | null = null;

  constructor(private readonly osuDbDao: OsuDBDao, private readonly osuFolderService: OsuFolderService) {}

  private get songsFolder() {
    return this.osuFolderService.songsFolder$.getValue();
  }

  private completeRead() {
    if (!this.reading) {
      this.reading = this.readAll().finally(() => (this.reading = null));
    }
    return this.reading;
  }

  private async readAll() {
    const freshBlueprints = [...(await this.osuDbDao.getAllBlueprints())];
    const lastModifiedTime = await this.osuDbDao.getOsuDbLastModifiedTime();

    console.log(`Reading the osu!/Songs folder: ${this.songsFolder}`);
    const candidates = await getNewFolderCandidates(this.songsFolder, new Date(lastModifiedTime));
    if (candidates.length > 0) {
      console.log(`New blueprint candidates (${candidates.length}) : ${candidates.join(",")}`);
    }

    for (const songFolder of candidates) {
      const osuFiles = await listOsuFiles(join(this.songsFolder, songFolder));
      for (const osuFile of osuFiles) {
        const fileName = join(this.songsFolder, songFolder, osuFile);
        console.log(`Reading file ${fileName}`);
        const data = await readFile(fileName);
        const hash = createHash("md5");
        hash.update(data);
        const md5Hash = hash.digest("hex");
        const blueprint = await parseBlueprint(data.toString("utf-8"), { sectionsToRead: METADATA_SECTIONS_TO_READ });
        freshBlueprints.push(mapToLocalBlueprint(blueprint, osuFile, songFolder, md5Hash));
      }
    }

    const blueprints: Record<BlueprintMD5, BlueprintInfo> = {};
    freshBlueprints.forEach((b) => (blueprints[b.md5Hash] = b));
    this.blueprints = blueprints;
    return this.blueprints;
  }

  private addNewBlueprint(blueprint: BlueprintInfo) {
    this.blueprints[blueprint.md5Hash] = blueprint;
  }

  async blueprintHasBeenAdded() {
    if (await this.osuDbDao.hasChanged()) {
      return true;
    }
    const s = await stat(this.songsFolder);
    const t = await this.osuDbDao.getOsuDbLastModifiedTime();
    return s.mtime.getTime() > t;
  }

  async getAllBlueprints(): Promise<Record<string, BlueprintInfo>> {
    if (this.reading) return this.reading;
    const needToCheckAgain = await this.blueprintHasBeenAdded();
    if (needToCheckAgain) {
      return this.completeRead();
    }
    return this.blueprints;
  }

  async getBlueprintByMD5(md5: string): Promise<BlueprintInfo | undefined> {
    const maps = await this.getAllBlueprints();
    if (maps[md5]) return maps[md5];
    console.log(`Blueprint ${md5} not in cache, reading osu!.db and Songs again`);
    return (await this.completeRead())[md5];
  }

  public async blueprintBg(md5: string): Promise<string | undefined> {
    const blueprintMetaData = await this.getBlueprintByMD5(md5);
    if (!blueprintMetaData) return undefined;
    const { osuFileName, folderName } = blueprintMetaData;
    const data = await readFile(join(this.songsFolder, folderName, osuFileName), { encoding: "utf-8" });
    const parsedBlueprint = parseBlueprint(data, { sectionsToRead: ["Events"] });
    return parsedBlueprint.blueprintInfo.metadata.backgroundFile;
  }
}

export async function getNewFolderCandidates(songsFolder: string, importedLaterThan: Date): Promise<string[]> {
  return filterFilenamesInDirectory(songsFolder, async (fileName) => {
    const s = await stat(join(songsFolder, fileName));
    return s.mtime.getTime() > importedLaterThan.getTime() && s.isDirectory();
  });
}

export async function listOsuFiles(songFolder: string): Promise<string[]> {
  return filterFilenamesInDirectory(songFolder, async (fileName) => fileName.endsWith(".osu"));
}
