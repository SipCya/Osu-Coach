import { copyFile, mkdir, readdir, rename, stat, unlink, writeFile } from "fs/promises";
import { join } from "path";

export const BACKUP_FOLDER = "osucoach-backups";
const BACKUPS_TO_KEEP = 10;

function timestamp(date = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(
    date.getMinutes(),
  )}${p(date.getSeconds())}`;
}

export async function backupOsuFile(osuFolder: string, path: string, prefix: string) {
  const folder = join(osuFolder, BACKUP_FOLDER);
  await mkdir(folder, { recursive: true });
  const stamp = timestamp();
  let target = join(folder, `${prefix}-${stamp}.db`);
  for (let n = 2; (await mtimeOrNull(target)) !== null; n++) target = join(folder, `${prefix}-${stamp}-${n}.db`);
  await copyFile(path, target);
  const pattern = new RegExp(`^${prefix}-\\d{8}-\\d{6}(-\\d+)?\\.db$`);
  const old = (await readdir(folder)).filter((f) => pattern.test(f)).sort();
  for (const f of old.slice(0, Math.max(0, old.length - BACKUPS_TO_KEEP))) {
    await unlink(join(folder, f)).catch(() => undefined);
  }
  return target;
}

export interface BackupFile {
  path: string;
  name: string;
  kind: "collection" | "scores" | "other";
  modified: Date;
  size: number;
}

export const backupFolder = (osuFolder: string) => join(osuFolder, BACKUP_FOLDER);

export async function listBackups(osuFolder: string): Promise<BackupFile[]> {
  const folder = backupFolder(osuFolder);
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return [];
  }
  const backups: BackupFile[] = [];
  for (const name of names) {
    const path = join(folder, name);
    try {
      const s = await stat(path);
      if (!s.isFile()) continue;
      const kind = name.startsWith("collection-") ? "collection" : name.startsWith("scores-") ? "scores" : "other";
      backups.push({ path, name, kind, modified: s.mtime, size: s.size });
    } catch {
      continue;
    }
  }
  return backups.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

export async function writeFileSafely(path: string, data: Buffer) {
  const temporary = `${path}.osucoach-tmp`;
  await writeFile(temporary, data);
  await rename(temporary, path);
}

export async function mtimeOrNull(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}
