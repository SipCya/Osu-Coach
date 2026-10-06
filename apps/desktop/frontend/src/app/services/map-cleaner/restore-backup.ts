import { readFile } from "fs/promises";
import { join } from "path";
import { isOsuRunning } from "../common/local/osu-process";
import { BackupFile, backupOsuFile, mtimeOrNull, writeFileSafely } from "../common/local/osu-backup";
import { readCollectionDb } from "../collections/collection-db";
import { readScoresDb } from "./scores-db";

export type RestoreResult =
  | { ok: true; target: string; safetyBackup?: string }
  | { ok: false; reason: "osuRunning" | "invalid" | "unsupported" | "error"; error?: string };

const TARGETS: Record<"collection" | "scores", string> = {
  collection: "collection.db",
  scores: "scores.db",
};

export async function restoreBackup(osuFolder: string, backup: BackupFile): Promise<RestoreResult> {
  if (backup.kind === "other") return { ok: false, reason: "unsupported" };
  const target = join(osuFolder, TARGETS[backup.kind]);
  try {
    if (await isOsuRunning()) return { ok: false, reason: "osuRunning" };

    const data = await readFile(backup.path);
    try {
      if (backup.kind === "collection") readCollectionDb(data);
      else readScoresDb(data);
    } catch (e) {
      return { ok: false, reason: "invalid", error: e instanceof Error ? e.message : String(e) };
    }

    const safetyBackup =
      (await mtimeOrNull(target)) !== null ? await backupOsuFile(osuFolder, target, backup.kind) : undefined;
    await writeFileSafely(target, data);
    return { ok: true, target, safetyBackup };
  } catch (e) {
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
