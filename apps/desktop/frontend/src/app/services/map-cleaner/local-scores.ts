import { readFile } from "fs/promises";
import { join } from "path";
import { isOsuRunning } from "../common/local/osu-process";
import { backupOsuFile, mtimeOrNull, writeFileSafely } from "../common/local/osu-backup";
import { listLocalReplays, RemovalMethod, RemovalResult, removeFiles, replayFilesWithExtras } from "./map-cleaner";
import { PlayerScores, readScoresDb, scoresByPlayer, writeScoresDb } from "./scores-db";

export interface LoadedScores {
  players: PlayerScores[];
  mtime: number | null;
}

export type RemoveScoresResult =
  | { ok: true; removedScores: number; backup: string; replays?: RemovalResult }
  | { ok: false; reason: "osuRunning" | "changedOnDisk" | "error"; error?: string };

const scoresDbPath = (osuFolder: string) => join(osuFolder, "scores.db");

export async function loadLocalScores(osuFolder: string): Promise<LoadedScores> {
  const path = scoresDbPath(osuFolder);
  const mtime = await mtimeOrNull(path);
  if (mtime === null) return { players: [], mtime };
  return { players: scoresByPlayer(readScoresDb(await readFile(path))), mtime };
}

export async function removePlayersScores(
  osuFolder: string,
  players: string[],
  loadedMtime: number | null,
  options: { removeReplays: boolean; method: RemovalMethod },
): Promise<RemoveScoresResult> {
  const path = scoresDbPath(osuFolder);
  try {
    if (await isOsuRunning()) return { ok: false, reason: "osuRunning" };
    if ((await mtimeOrNull(path)) !== loadedMtime) return { ok: false, reason: "changedOnDisk" };

    const db = readScoresDb(await readFile(path));
    const toRemove = new Set(players);
    const removedReplays = new Set<string>();
    let removedScores = 0;
    const data = writeScoresDb(db, (score) => {
      if (!toRemove.has(score.player)) return true;
      removedScores++;
      if (score.replayMD5) removedReplays.add(score.replayMD5);
      return false;
    });

    const backup = await backupOsuFile(osuFolder, path, "scores");
    await writeFileSafely(path, data);

    let replays: RemovalResult | undefined;
    if (options.removeReplays && removedReplays.size > 0) {
      const osr = (await listLocalReplays(osuFolder)).filter((r) => removedReplays.has(r.replayMD5)).map((r) => r.path);
      replays = await removeFiles(await replayFilesWithExtras(osr), options.method, {
        osuFolder,
        baseFolder: osuFolder,
      });
    }
    return { ok: true, removedScores, backup, replays };
  } catch (e) {
    console.error("Could not change scores.db", e);
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
