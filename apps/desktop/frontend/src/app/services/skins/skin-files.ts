import { Dirent } from "fs";
import { copyFile, mkdir, readdir, readFile, rm, stat, unlink, writeFile } from "fs/promises";
import { dirname, join } from "path";
import {
  canonicalName,
  classifySkinFiles,
  decodeSkinIni,
  DEFAULT_FONTS,
  groupOf,
  MixAssignment,
  mixedSkinIni,
  parseSkinFonts,
  SKIN_GROUPS,
  SkinFile,
  SkinFonts,
  SkinGroupId,
  targetPath,
} from "./skin-elements";

export const ORIGINALS_FOLDER = ".osucoach-originals";
const MANIFEST = "manifest.json";

interface ManifestEntry {
  path: string;
  state: "original" | "added";
}

interface Manifest {
  files: Record<string, ManifestEntry>;
}

export interface LoadedSkin {
  name: string;
  folder: string;
  fonts: SkinFonts;
  ini: string | null;
  groups: Map<SkinGroupId, SkinFile[]>;
  modified: Set<SkinGroupId>;
}

export const skinsFolder = (osuFolder: string) => join(osuFolder, "Skins");

export async function listSkins(osuFolder: string): Promise<string[]> {
  try {
    const entries = await readdir(skinsFolder(osuFolder), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  } catch {
    return [];
  }
}

async function listFolder(folder: string, prefix = ""): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(join(folder, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isFile()).map((e) => (prefix ? `${prefix}/${e.name}` : e.name));
}

async function readSkinIni(folder: string, files: string[]): Promise<string | null> {
  const name = files.find((f) => f.toLowerCase() === "skin.ini");
  if (!name) return null;
  try {
    return decodeSkinIni(await readFile(join(folder, name)));
  } catch {
    return null;
  }
}

async function readManifest(folder: string): Promise<Manifest> {
  try {
    const raw = JSON.parse(await readFile(join(folder, ORIGINALS_FOLDER, MANIFEST), "utf-8"));
    return raw && typeof raw.files === "object" ? (raw as Manifest) : { files: {} };
  } catch {
    return { files: {} };
  }
}

async function writeManifest(folder: string, manifest: Manifest) {
  await mkdir(join(folder, ORIGINALS_FOLDER), { recursive: true });
  await writeFile(join(folder, ORIGINALS_FOLDER, MANIFEST), JSON.stringify(manifest, null, 2));
}

function groupOfPath(path: string, fonts: SkinFonts): SkinGroupId | null {
  const canonical = canonicalName(path, fonts);
  return canonical ? groupOf(canonical) : null;
}

export async function loadSkin(osuFolder: string, name: string): Promise<LoadedSkin> {
  const folder = join(skinsFolder(osuFolder), name);
  const root = await listFolder(folder);
  const ini = await readSkinIni(folder, root);
  const fonts = ini ? parseSkinFonts(ini) : DEFAULT_FONTS;
  const files = [...root];
  for (const prefix of new Set([fonts.hitCirclePrefix, fonts.scorePrefix])) {
    const dir = prefix.includes("/") ? prefix.slice(0, prefix.lastIndexOf("/")) : "";
    if (dir && dir.toLowerCase() !== ORIGINALS_FOLDER) files.push(...(await listFolder(folder, dir)));
  }
  const manifest = await readManifest(folder);
  const modified = new Set<SkinGroupId>();
  for (const entry of Object.values(manifest.files)) {
    const group = groupOfPath(entry.path, fonts);
    if (group) modified.add(group);
  }
  return { name, folder, fonts, ini, groups: classifySkinFiles(files, fonts), modified };
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function protect(folder: string, manifest: Manifest, path: string) {
  const key = path.toLowerCase();
  if (manifest.files[key]) return;
  if (await exists(join(folder, path))) {
    const backup = join(folder, ORIGINALS_FOLDER, path);
    await mkdir(dirname(backup), { recursive: true });
    await copyFile(join(folder, path), backup);
    manifest.files[key] = { path, state: "original" };
  } else {
    manifest.files[key] = { path, state: "added" };
  }
}

export async function replaceGroup(osuFolder: string, targetName: string, sourceName: string, group: SkinGroupId) {
  const target = await loadSkin(osuFolder, targetName);
  const source = await loadSkin(osuFolder, sourceName);
  const manifest = await readManifest(target.folder);

  for (const file of target.groups.get(group) ?? []) {
    await protect(target.folder, manifest, file.path);
    await unlink(join(target.folder, file.path)).catch(() => undefined);
  }
  for (const file of source.groups.get(group) ?? []) {
    const to = targetPath(file.canonical, target.fonts);
    await protect(target.folder, manifest, to);
    await mkdir(dirname(join(target.folder, to)), { recursive: true });
    await copyFile(join(source.folder, file.path), join(target.folder, to));
  }
  await writeManifest(target.folder, manifest);
}

export async function restoreGroup(osuFolder: string, skinName: string, group: SkinGroupId) {
  const skin = await loadSkin(osuFolder, skinName);
  const manifest = await readManifest(skin.folder);
  for (const file of skin.groups.get(group) ?? []) {
    if (manifest.files[file.path.toLowerCase()]) await unlink(join(skin.folder, file.path)).catch(() => undefined);
  }
  for (const [key, entry] of Object.entries(manifest.files)) {
    if (groupOfPath(entry.path, skin.fonts) !== group) continue;
    if (entry.state === "original") {
      const backup = join(skin.folder, ORIGINALS_FOLDER, entry.path);
      await mkdir(dirname(join(skin.folder, entry.path)), { recursive: true });
      await copyFile(backup, join(skin.folder, entry.path));
      await unlink(backup).catch(() => undefined);
    } else {
      await unlink(join(skin.folder, entry.path)).catch(() => undefined);
    }
    delete manifest.files[key];
  }
  if (Object.keys(manifest.files).length === 0) {
    await rm(join(skin.folder, ORIGINALS_FOLDER), { recursive: true, force: true });
  } else {
    await writeManifest(skin.folder, manifest);
  }
}

export async function readSkinFile(skin: LoadedSkin, path: string): Promise<Buffer> {
  return readFile(join(skin.folder, path));
}

export async function writeSkinImage(skin: LoadedSkin, path: string, data: Buffer) {
  const manifest = await readManifest(skin.folder);
  await protect(skin.folder, manifest, path);
  await writeFile(join(skin.folder, path), data);
  await writeManifest(skin.folder, manifest);
}

export async function skinAvailability(osuFolder: string, names: string[]) {
  const availability = new Map<string, Set<SkinGroupId>>();
  for (const name of names) {
    try {
      const skin = await loadSkin(osuFolder, name);
      availability.set(
        name,
        new Set(SKIN_GROUPS.filter((g) => (skin.groups.get(g.id)?.length ?? 0) > 0).map((g) => g.id)),
      );
    } catch {
      availability.set(name, new Set());
    }
  }
  return availability;
}

export async function createMixedSkin(
  osuFolder: string,
  wantedName: string,
  assignment: MixAssignment,
): Promise<string> {
  const clean = wantedName.replace(/[<>:"/\\|?*]/g, "").trim() || "osu!coach mix";
  let name = clean;
  for (let n = 2; await exists(join(skinsFolder(osuFolder), name)); n++) name = `${clean} (${n})`;
  const folder = join(skinsFolder(osuFolder), name);
  await mkdir(folder, { recursive: true });

  const cache = new Map<string, LoadedSkin>();
  const load = async (skinName: string) => {
    const cached = cache.get(skinName) ?? (await loadSkin(osuFolder, skinName));
    cache.set(skinName, cached);
    return cached;
  };

  for (const [group, sourceName] of Object.entries(assignment) as [SkinGroupId, string][]) {
    const source = await load(sourceName);
    for (const file of source.groups.get(group) ?? []) {
      await copyFile(join(source.folder, file.path), join(folder, file.canonical));
    }
  }
  const iniSource = assignment.hitcircle ?? Object.values(assignment)[0];
  const baseIni = iniSource ? (await load(iniSource)).ini : null;
  await writeFile(join(folder, "skin.ini"), mixedSkinIni(baseIni, name));
  return name;
}
