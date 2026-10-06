import { join } from "path";
import { Beatmap as DBBeatmap, OsuDBReader } from "@osucoach/osu-local/db-reader";
import { fileLastModifiedTime, ticksToDate } from "@osucoach/osu-local/utils";
import { readFile } from "fs/promises";
import { BlueprintInfo } from "../../../model/BlueprintInfo";
import { OsuFolderService } from "./OsuFolderService";
import { injectable } from "inversify";

const mapToBlueprint = (b: DBBeatmap): BlueprintInfo => {
  return {
    md5Hash: b.md5Hash,
    audioFileName: b.audioFileName,
    folderName: b.folderName,
    lastPlayed: ticksToDate(b.lastPlayed)[0],
    osuFileName: b.fileName,
    artist: b.artist,
    title: b.title,
    creator: b.creator,
  };
};

@injectable()
export class OsuDBDao {
  private lastMtime = -1;
  private blueprints: BlueprintInfo[] = [];
  private reading: Promise<BlueprintInfo[]> | null = null;

  constructor(private readonly osuFolderService: OsuFolderService) {
    this.osuFolderService.settings$.subscribe(() => {
      this.lastMtime = -1;
      this.blueprints = [];
    });
  }

  private get osuDbPath() {
    return join(this.osuFolderService.getOsuFolder(), "osu!.db");
  }

  private async createReader() {
    const buffer = await readFile(this.osuDbPath);
    return new OsuDBReader(buffer);
  }

  async getOsuDbLastModifiedTime() {
    return await fileLastModifiedTime(this.osuDbPath);
  }

  async hasChanged(): Promise<boolean> {
    return this.cachedTime !== (await this.getOsuDbLastModifiedTime());
  }

  get cachedTime() {
    return this.lastMtime;
  }

  async getAllBlueprints(): Promise<BlueprintInfo[]> {
    const lastModified = await this.getOsuDbLastModifiedTime();
    if (lastModified === this.lastMtime) {
      return this.blueprints;
    }
    if (this.reading) return this.reading;
    this.reading = (async () => {
      try {
        console.log(`Reading the osu!.db with lastModifiedTime=${lastModified}`);
        const reader = await this.createReader();
        const osuDB = await reader.readOsuDB();
        this.blueprints = osuDB.beatmaps.map(mapToBlueprint);
        this.lastMtime = lastModified;
        return this.blueprints;
      } finally {
        this.reading = null;
      }
    })();
    return this.reading;
  }

  async getBlueprintByMD5(md5: string): Promise<BlueprintInfo | undefined> {
    const maps = await this.getAllBlueprints();
    return maps.find((m) => m.md5Hash === md5);
  }
}
