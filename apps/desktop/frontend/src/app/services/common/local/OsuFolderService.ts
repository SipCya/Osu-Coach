import { injectable } from "inversify";
import { access } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { constants } from "fs";
import { BehaviorSubject } from "rxjs";
import { determineSongsFolder } from "@osucoach/osu-local/utils";
import username from "username";
import { ipcRenderer } from "electron";
import { PersistentService } from "../../core/service";
import { JSONSchemaType } from "ajv";

const filesToCheck = ["osu!.db", "scores.db", "Skins"];

export async function osuFolderSanityCheck(osuFolderPath: string) {
  try {
    await Promise.all(filesToCheck.map((f) => access(join(osuFolderPath, f), constants.R_OK)));
  } catch (err) {
    console.log(err);
    return false;
  }
  return true;
}

interface OsuSettings {
  osuStablePath: string;
}

export const DEFAULT_OSU_SETTINGS: OsuSettings = Object.freeze({
  osuStablePath: "",
});
export const OsuSettingsSchema: JSONSchemaType<OsuSettings> = {
  type: "object",
  properties: {
    osuStablePath: { type: "string", default: DEFAULT_OSU_SETTINGS.osuStablePath },
  },
  required: [],
};

@injectable()
export class OsuFolderService extends PersistentService<OsuSettings> {
  public replaysFolder$ = new BehaviorSubject<string>("");
  public songsFolder$ = new BehaviorSubject<string>("");

  key = "osu-settings";
  schema = OsuSettingsSchema;

  constructor() {
    super();
    this.settings$.subscribe(this.onFolderChange.bind(this));
  }

  getDefaultValue(): OsuSettings {
    return DEFAULT_OSU_SETTINGS;
  }

  async onFolderChange(osuSettings: OsuSettings) {
    const { osuStablePath } = osuSettings;
    ipcRenderer.send("osuFolderChanged", osuStablePath);
    this.replaysFolder$.next(join(osuStablePath, "Replays"));
    const userId = await username();
    this.songsFolder$.next((await determineSongsFolder(osuStablePath, userId as string)) as string);
  }

  getOsuFolder(): string {
    return this.settings.osuStablePath;
  }

  setOsuFolder(path: string) {
    console.log(`osu! folder was set to '${path}'`);
    this.changeSettings((draft) => (draft.osuStablePath = path));
  }

  async isValidOsuFolder(directoryPath: string) {
    return osuFolderSanityCheck(directoryPath);
  }

  async hasValidOsuFolderSet(): Promise<boolean> {
    return this.isValidOsuFolder(this.getOsuFolder());
  }

  async autoDetectOsuFolder(): Promise<boolean> {
    if (await this.hasValidOsuFolderSet()) return true;
    const localAppData = process.env["LOCALAPPDATA"] ?? join(homedir(), "AppData", "Local");
    const candidates = [
      join(localAppData, "osu!"),
      join(process.env["ProgramFiles"] ?? "C:\\Program Files", "osu!"),
      join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "osu!"),
      "C:\\osu!",
      "D:\\osu!",
    ];
    for (const candidate of candidates) {
      if (await this.isValidOsuFolder(candidate)) {
        console.log(`osu! folder auto-detected at '${candidate}'`);
        this.setOsuFolder(candidate);
        return true;
      }
    }
    return false;
  }
}
