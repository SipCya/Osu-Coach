import { BehaviorSubject } from "rxjs";
import { readFile } from "fs/promises";
import { join } from "path";
import { Beatmap as DBBeatmap, OsuDBReader, StarRatings } from "@osucoach/osu-local/db-reader";
import { compareBeatmaps, GameMode, LocalBeatmap, OsuCollection } from "../../utils/collection-manager";
import { isOsuRunning } from "../common/local/osu-process";
import { backupOsuFile, mtimeOrNull, writeFileSafely } from "../common/local/osu-backup";
import { DEFAULT_COLLECTION_DB_VERSION, readCollectionDb, writeCollectionDb } from "./collection-db";

const OSU_RUNNING_POLL_MS = 3000;

export interface CollectionStoreState {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  osuFolder: string;
  beatmaps: LocalBeatmap[];
  beatmapsById: Map<string, LocalBeatmap>;
  collections: OsuCollection[];
  dirty: boolean;
}

export type SaveResult =
  | { ok: true; backup?: string }
  | { ok: false; reason: "osuRunning" | "changedOnDisk" | "error"; error?: string };

const INITIAL_STATE: CollectionStoreState = {
  status: "idle",
  osuFolder: "",
  beatmaps: [],
  beatmapsById: new Map(),
  collections: [],
  dirty: false,
};

function noModStars(ratings: StarRatings): number {
  const nomod = ratings.find(([mods]) => mods === 0);
  return nomod ? nomod[1] : 0;
}

function toLocalBeatmap(b: DBBeatmap): LocalBeatmap {
  const mode = (b.gameplayMode & 3) as GameMode;
  const ratings = [b.stdStarRatings, b.taikoStarRatings, b.catchStarRatings, b.maniaStarRatings][mode];
  return {
    md5: b.md5Hash,
    artist: b.artist,
    title: b.title,
    creator: b.creator,
    version: b.difficulty,
    mode,
    stars: noModStars(ratings),
    rankedStatus: b.rankedStatus,
    beatmapSetId: b.beatmapSetId,
    folderName: b.folderName,
    drainTime: b.drainTime,
    searchText: [b.artist, b.artistUnicode, b.title, b.titleUnicode, b.creator, b.difficulty, b.source, b.tags]
      .join(" ")
      .toLowerCase(),
  };
}

async function readInstalledBeatmaps(osuFolder: string) {
  const buffer = await readFile(join(osuFolder, "osu!.db"));
  const db = await new OsuDBReader(buffer).readOsuDB();
  const beatmaps = db.beatmaps.filter((b) => b.md5Hash).map(toLocalBeatmap);
  beatmaps.sort(compareBeatmaps);
  return { osuVersion: db.osuVersion, beatmaps };
}

class CollectionStore {
  readonly state$ = new BehaviorSubject<CollectionStoreState>(INITIAL_STATE);
  readonly osuRunning$ = new BehaviorSubject<boolean>(false);

  private dbVersion = DEFAULT_COLLECTION_DB_VERSION;
  private loadedMtime: number | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private loadToken = 0;

  private get state() {
    return this.state$.getValue();
  }

  private patch(partial: Partial<CollectionStoreState>) {
    this.state$.next({ ...this.state, ...partial });
  }

  private collectionDbPath(osuFolder = this.state.osuFolder) {
    return join(osuFolder, "collection.db");
  }

  async ensureLoaded(osuFolder: string) {
    if (this.state.osuFolder === osuFolder && (this.state.status === "ready" || this.state.status === "loading"))
      return;
    await this.load(osuFolder);
  }

  async load(osuFolder: string) {
    const token = ++this.loadToken;
    this.state$.next({ ...INITIAL_STATE, status: "loading", osuFolder });
    try {
      const { osuVersion, beatmaps } = await readInstalledBeatmaps(osuFolder);
      const { version, collections, mtime } = await this.readCollections(osuFolder, osuVersion);
      if (token !== this.loadToken) return;
      this.dbVersion = version;
      this.loadedMtime = mtime;
      this.state$.next({
        status: "ready",
        osuFolder,
        beatmaps,
        beatmapsById: new Map(beatmaps.map((b) => [b.md5, b])),
        collections,
        dirty: false,
      });
    } catch (e) {
      if (token !== this.loadToken) return;
      console.error("Could not load the osu! collections", e);
      this.patch({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  private async readCollections(osuFolder: string, fallbackVersion: number) {
    const path = this.collectionDbPath(osuFolder);
    const mtime = await mtimeOrNull(path);
    if (mtime === null) {
      return { version: fallbackVersion || DEFAULT_COLLECTION_DB_VERSION, collections: [], mtime };
    }
    const db = readCollectionDb(await readFile(path));
    return { ...db, mtime };
  }

  async discardChanges() {
    const { osuFolder } = this.state;
    try {
      const { version, collections, mtime } = await this.readCollections(osuFolder, this.dbVersion);
      this.dbVersion = version;
      this.loadedMtime = mtime;
      this.patch({ collections, dirty: false });
    } catch (e) {
      this.patch({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  update(change: (collections: OsuCollection[]) => OsuCollection[]) {
    this.patch({ collections: change(this.state.collections), dirty: true });
  }

  async save(): Promise<SaveResult> {
    const path = this.collectionDbPath();
    try {
      if (await isOsuRunning()) {
        this.osuRunning$.next(true);
        return { ok: false, reason: "osuRunning" };
      }
      if ((await mtimeOrNull(path)) !== this.loadedMtime) return { ok: false, reason: "changedOnDisk" };

      const backup =
        this.loadedMtime !== null ? await backupOsuFile(this.state.osuFolder, path, "collection") : undefined;
      const data = writeCollectionDb({ version: this.dbVersion, collections: this.state.collections });
      await writeFileSafely(path, data);
      this.loadedMtime = await mtimeOrNull(path);
      this.patch({ dirty: false });
      return { ok: true, backup };
    } catch (e) {
      console.error("Could not save collection.db", e);
      return { ok: false, reason: "error", error: e instanceof Error ? e.message : String(e) };
    }
  }

  startWatchingOsu() {
    if (this.pollTimer) return;
    const check = () => void isOsuRunning().then((running) => this.osuRunning$.next(running));
    check();
    this.pollTimer = setInterval(check, OSU_RUNNING_POLL_MS);
  }

  stopWatchingOsu() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }
}

export const collectionStore = new CollectionStore();
