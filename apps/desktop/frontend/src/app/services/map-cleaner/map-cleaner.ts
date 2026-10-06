import { BehaviorSubject } from "rxjs";
import { Dirent } from "fs";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "fs/promises";
import { basename, dirname, join, parse, relative } from "path";
import { shell } from "electron";
import {
  analyzeSet,
  BeatmapRefs,
  BLACK_PIXEL_PNG,
  CleanCategory,
  parseOsuFile,
  parseStoryboardFile,
  readReplayHeader,
} from "./cleaner-rules";

export type RemovalMethod = "trash" | "move" | "delete";

export interface FoundFile {
  path: string;
  category: CleanCategory;
  size: number;
}

export interface Progress {
  done: number;
  total: number;
}

export interface ScanState {
  status: "idle" | "scanning" | "done" | "error";
  progress: Progress;
  files: FoundFile[];
  missingBackgrounds: string[];
  error?: string;
}

export interface LocalReplay {
  path: string;
  player: string;
  replayMD5: string;
  size: number;
}

export interface ReplayGroup {
  player: string;
  files: string[];
  size: number;
}

export interface RemovalResult {
  removed: string[];
  failed: { path: string; error: string }[];
  bytes: number;
}

const CONCURRENCY = 8;
const MAX_DEPTH = 6;
export const CLEANED_FOLDER = "Cleaned";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function forEachLimited<T>(items: T[], task: (item: T) => Promise<void>, isCancelled = () => false) {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !isCancelled()) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

async function listFiles(folder: string, prefix = "", depth = 0): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(join(folder, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory() && depth < MAX_DEPTH) files.push(...(await listFiles(folder, rel, depth + 1)));
    else if (entry.isFile()) files.push(rel);
  }
  return files;
}

async function fileSize(path: string) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function scanSet(setFolder: string) {
  const files = await listFiles(setFolder);
  const beatmaps = new Map<string, BeatmapRefs>();
  const storyboard: string[] = [];
  for (const file of files) {
    const lower = file.toLowerCase();
    if (!lower.endsWith(".osu") && !lower.endsWith(".osb")) continue;
    try {
      const text = await readFile(join(setFolder, file), "utf-8");
      if (lower.endsWith(".osu")) beatmaps.set(file, parseOsuFile(text));
      else storyboard.push(...parseStoryboardFile(text));
    } catch {
      continue;
    }
  }
  const { removable, missingBackgrounds } = analyzeSet({ files, beatmaps, storyboard });
  const found: FoundFile[] = [];
  for (const [file, category] of removable) {
    const path = join(setFolder, file);
    found.push({ path, category, size: await fileSize(path) });
  }
  return { found, missing: missingBackgrounds.map((bg) => join(setFolder, bg)) };
}

async function moveFile(from: string, to: string) {
  await mkdir(dirname(to), { recursive: true });
  try {
    await rename(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    await copyFile(from, to);
    await unlink(from);
  }
}

export async function removeFiles(
  paths: string[],
  method: RemovalMethod,
  options: { osuFolder: string; baseFolder: string; onProgress?: (p: Progress) => void },
): Promise<RemovalResult> {
  const result: RemovalResult = { removed: [], failed: [], bytes: 0 };
  let done = 0;
  await forEachLimited(paths, async (path) => {
    try {
      const size = await fileSize(path);
      if (method === "trash") await shell.trashItem(path);
      else if (method === "delete") await unlink(path);
      else await moveFile(path, join(options.osuFolder, CLEANED_FOLDER, relative(options.baseFolder, path)));
      result.removed.push(path);
      result.bytes += size;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") result.removed.push(path);
      else result.failed.push({ path, error: errorText(e) });
    }
    options.onProgress?.({ done: ++done, total: paths.length });
  });
  return result;
}

const INITIAL_SCAN: ScanState = { status: "idle", progress: { done: 0, total: 0 }, files: [], missingBackgrounds: [] };

class MapCleaner {
  readonly scan$ = new BehaviorSubject<ScanState>(INITIAL_SCAN);
  private scanToken = 0;

  private get scan() {
    return this.scan$.getValue();
  }

  async startScan(songsFolder: string) {
    const token = ++this.scanToken;
    const cancelled = () => token !== this.scanToken;
    this.scan$.next({ ...INITIAL_SCAN, status: "scanning" });
    try {
      const sets = (await readdir(songsFolder, { withFileTypes: true })).filter((e) => e.isDirectory());
      const files: FoundFile[] = [];
      const missing: string[] = [];
      let done = 0;
      let lastUpdate = 0;
      await forEachLimited(
        sets,
        async (set) => {
          const { found, missing: m } = await scanSet(join(songsFolder, set.name));
          files.push(...found);
          missing.push(...m);
          done++;
          if (Date.now() - lastUpdate > 150 || done === sets.length) {
            lastUpdate = Date.now();
            if (!cancelled()) this.scan$.next({ ...this.scan, progress: { done, total: sets.length } });
          }
        },
        cancelled,
      );
      if (cancelled()) return;
      files.sort((a, b) => a.path.localeCompare(b.path));
      this.scan$.next({ status: "done", progress: { done, total: sets.length }, files, missingBackgrounds: missing });
    } catch (e) {
      if (!cancelled()) this.scan$.next({ ...INITIAL_SCAN, status: "error", error: errorText(e) });
    }
  }

  cancelScan() {
    this.scanToken++;
    this.scan$.next(INITIAL_SCAN);
  }

  forgetRemoved(removed: string[]) {
    const gone = new Set(removed);
    const removedBackgrounds = this.scan.files.filter((f) => gone.has(f.path) && f.category === "backgrounds");
    this.scan$.next({
      ...this.scan,
      files: this.scan.files.filter((f) => !gone.has(f.path)),
      missingBackgrounds: [...this.scan.missingBackgrounds, ...removedBackgrounds.map((f) => f.path)],
    });
  }

  async replaceMissingBackgrounds(onProgress?: (p: Progress) => void): Promise<RemovalResult> {
    const paths = this.scan.missingBackgrounds;
    const result: RemovalResult = { removed: [], failed: [], bytes: 0 };
    let done = 0;
    await forEachLimited(paths, async (path) => {
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, BLACK_PIXEL_PNG, { flag: "wx" });
        result.removed.push(path);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EEXIST") result.removed.push(path);
        else result.failed.push({ path, error: errorText(e) });
      }
      onProgress?.({ done: ++done, total: paths.length });
    });
    const replaced = new Set(result.removed);
    this.scan$.next({ ...this.scan, missingBackgrounds: paths.filter((p) => !replaced.has(p)) });
    return result;
  }
}

export const mapCleaner = new MapCleaner();

export const replaysFolder = (osuFolder: string) => join(osuFolder, "Data", "r");

export async function listLocalReplays(osuFolder: string): Promise<LocalReplay[]> {
  const folder = replaysFolder(osuFolder);
  let names: string[];
  try {
    names = (await readdir(folder)).filter((n) => n.toLowerCase().endsWith(".osr"));
  } catch {
    return [];
  }
  const replays: LocalReplay[] = [];
  await forEachLimited(names, async (name) => {
    const path = join(folder, name);
    const replay: LocalReplay = { path, player: "?", replayMD5: "", size: 0 };
    try {
      const handle = await open(path, "r");
      try {
        const buffer = Buffer.alloc(512);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        const header = readReplayHeader(buffer.subarray(0, bytesRead));
        if (header) Object.assign(replay, header);
        replay.size = (await handle.stat()).size;
      } finally {
        await handle.close();
      }
    } catch {
      replay.player = "?";
    }
    replays.push(replay);
  });
  return replays;
}

export async function scanReplays(osuFolder: string): Promise<ReplayGroup[]> {
  const groups = new Map<string, ReplayGroup>();
  for (const r of await listLocalReplays(osuFolder)) {
    const group = groups.get(r.player) ?? { player: r.player, files: [], size: 0 };
    group.files.push(r.path);
    group.size += r.size;
    groups.set(r.player, group);
  }
  return [...groups.values()].sort((a, b) => b.files.length - a.files.length);
}

export async function replayFilesWithExtras(osrPaths: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (const osr of osrPaths) {
    paths.push(osr);
    const osg = osr.replace(/\.osr$/i, ".osg");
    if ((await fileSize(osg)) > 0) paths.push(osg);
  }
  return paths;
}

export async function isLinkedFolder(path: string) {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function folderBytes(folder: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) total += await folderBytes(path);
    else if (entry.isFile()) total += await fileSize(path);
  }
  return total;
}

async function copyFolder(from: string, to: string, onBytes: (bytes: number) => void) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) await copyFolder(source, target, onBytes);
    else if (entry.isFile()) {
      await copyFile(source, target);
      onBytes(await fileSize(target));
    }
  }
}

export type MoveSongsError = "alreadyLinked" | "targetExists" | "insideSongs";

export async function moveSongsFolder(
  songsFolder: string,
  destinationParent: string,
  onProgress: (p: Progress) => void,
): Promise<{ ok: true; target: string } | { ok: false; reason: MoveSongsError }> {
  if (await isLinkedFolder(songsFolder)) return { ok: false, reason: "alreadyLinked" };
  const target = join(destinationParent, basename(songsFolder));
  const rel = relative(songsFolder, target);
  if (!rel.startsWith("..") && !parse(rel).root) return { ok: false, reason: "insideSongs" };
  if (await exists(target)) return { ok: false, reason: "targetExists" };

  const sameDisk = parse(songsFolder).root.toLowerCase() === parse(target).root.toLowerCase();
  let moved = false;
  if (sameDisk) {
    try {
      await rename(songsFolder, target);
      moved = true;
    } catch {
      moved = false;
    }
  }
  if (!moved) {
    const total = await folderBytes(songsFolder);
    let done = 0;
    onProgress({ done, total });
    try {
      await copyFolder(songsFolder, target, (bytes) => {
        done += bytes;
        onProgress({ done, total });
      });
    } catch (e) {
      await rm(target, { recursive: true, force: true }).catch(() => undefined);
      throw e;
    }
    await rm(songsFolder, { recursive: true, force: true });
  }
  await symlink(target, songsFolder, "junction");
  return { ok: true, target };
}
