import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { applySkinChanges, LoadedSkin, ORIGINALS_FOLDER, readSkinFile } from "../skins/skin-files";
import { cursorImageGeometry, currentSkinFromConfig, FlashlightLook, setIniGeneralValues } from "./flashlight-math";

export async function detectCurrentSkin(osuFolder: string): Promise<string | null> {
  let names: string[];
  try {
    names = (await readdir(osuFolder)).filter((n) => /^osu!\..+\.cfg$/i.test(n) && n.toLowerCase() !== "osu!.cfg");
  } catch {
    return null;
  }
  const withTime = await Promise.all(
    names.map(async (name) => ({ name, time: (await stat(join(osuFolder, name)).catch(() => null))?.mtimeMs ?? 0 })),
  );
  withTime.sort((a, b) => b.time - a.time);
  for (const { name } of withTime) {
    try {
      const skin = currentSkinFromConfig(await readFile(join(osuFolder, name), "utf-8"));
      if (skin) return skin;
    } catch {
      continue;
    }
  }
  return null;
}

export function isCursorCentred(ini: string | null): boolean {
  if (!ini) return true;
  const m = /^\s*CursorCentre\s*:\s*(\d)/im.exec(ini);
  return !m || m[1] !== "0";
}

interface CursorSource {
  bitmap: ImageBitmap;
  scale: number;
}

const MAX_REAL_CURSOR_SIZE = 1500;

async function decode(data: Buffer): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([data], { type: "image/png" }));
}

async function originalCursorFiles(skin: LoadedSkin): Promise<{ hd?: string; sd?: string }> {
  const folder = join(skin.folder, ORIGINALS_FOLDER);
  const names = await readdir(folder).catch(() => [] as string[]);
  return {
    hd: names.find((n) => n.toLowerCase() === "cursor@2x.png"),
    sd: names.find((n) => n.toLowerCase() === "cursor.png"),
  };
}

async function pick(candidates: { read: () => Promise<Buffer>; scale: number }[]): Promise<CursorSource | null> {
  for (const candidate of candidates) {
    try {
      const bitmap = await decode(await candidate.read());
      if (Math.max(bitmap.width, bitmap.height) <= MAX_REAL_CURSOR_SIZE) return { bitmap, scale: candidate.scale };
    } catch {
      continue;
    }
  }
  return null;
}

async function cursorSource(skin: LoadedSkin, builtInSkinsFolder: string): Promise<CursorSource | null> {
  const files = skin.groups.get("cursor") ?? [];
  const hd = files.find((f) => f.canonical.toLowerCase() === "cursor@2x.png");
  const sd = files.find((f) => f.canonical.toLowerCase() === "cursor.png");
  const originals = await originalCursorFiles(skin);
  const backup = join(skin.folder, ORIGINALS_FOLDER);
  const candidates: { read: () => Promise<Buffer>; scale: number }[] = [];
  if (hd) candidates.push({ read: () => readSkinFile(skin, hd.path), scale: 0.5 });
  if (sd) candidates.push({ read: () => readSkinFile(skin, sd.path), scale: 1 });
  const hdOriginal = originals.hd;
  const sdOriginal = originals.sd;
  if (hdOriginal) candidates.push({ read: () => readFile(join(backup, hdOriginal)), scale: 0.5 });
  if (sdOriginal) candidates.push({ read: () => readFile(join(backup, sdOriginal)), scale: 1 });
  candidates.push({ read: () => readFile(join(builtInSkinsFolder, "OsuDefaultSkin", "cursor.png")), scale: 1 });
  return pick(candidates);
}

export async function renderFlashlightCursor(
  skin: LoadedSkin,
  look: FlashlightLook,
  aspect: number,
  builtInSkinsFolder: string,
): Promise<HTMLCanvasElement> {
  const { size, holeRadius } = cursorImageGeometry(look, aspect);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const center = size / 2;

  ctx.fillStyle = `rgba(0,0,0,${look.darkness})`;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "destination-out";
  const inner = holeRadius * (1 - look.softness);
  const gradient = ctx.createRadialGradient(center, center, Math.max(0, inner), center, center, holeRadius);
  gradient.addColorStop(0, "rgba(0,0,0,1)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, holeRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  const source = await cursorSource(skin, builtInSkinsFolder);
  if (source) {
    const w = source.bitmap.width * source.scale;
    const h = source.bitmap.height * source.scale;
    ctx.drawImage(source.bitmap, center - w / 2, center - h / 2, w, h);
  }
  return canvas;
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Buffer> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG encoding failed");
  return Buffer.from(await blob.arrayBuffer());
}

export async function applyFlashlightCursor(skin: LoadedSkin, png: Buffer) {
  const files = skin.groups.get("cursor") ?? [];
  const sd = files.find((f) => f.canonical.toLowerCase() === "cursor.png");
  const hd = files.filter((f) => f.canonical.toLowerCase() === "cursor@2x.png").map((f) => f.path);
  const ini = setIniGeneralValues(skin.ini, { CursorExpand: "0", CursorCentre: "1" });
  await applySkinChanges(
    skin,
    [
      { path: sd?.path ?? "cursor.png", data: png },
      { path: skin.iniFile ?? "skin.ini", data: ini },
    ],
    hd,
  );
}
