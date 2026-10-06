import type { Random } from "../trainer/trainer-math";

export type SkinGroupId =
  | "cursor"
  | "hitcircle"
  | "numbers"
  | "slider"
  | "judgements"
  | "followpoint"
  | "spinner"
  | "scoreNumbers"
  | "hitsounds"
  | "uiSounds";

export interface SkinGroup {
  id: SkinGroupId;
  kind: "image" | "sound";
  preview: string[];
}

export const SKIN_GROUPS: SkinGroup[] = [
  { id: "cursor", kind: "image", preview: ["cursor.png"] },
  { id: "hitcircle", kind: "image", preview: ["hitcircle.png", "hitcircleoverlay.png", "approachcircle.png"] },
  { id: "numbers", kind: "image", preview: ["default-1.png", "default-0.png"] },
  {
    id: "slider",
    kind: "image",
    preview: ["sliderb0.png", "sliderb.png", "sliderfollowcircle.png", "reversearrow.png"],
  },
  { id: "judgements", kind: "image", preview: ["hit300.png", "hit300-0.png", "hit100.png", "hit0.png"] },
  { id: "followpoint", kind: "image", preview: ["followpoint.png", "followpoint-0.png"] },
  { id: "spinner", kind: "image", preview: ["spinner-circle.png", "spinner-approachcircle.png", "spinner-bottom.png"] },
  { id: "scoreNumbers", kind: "image", preview: ["score-1.png", "score-0.png"] },
  { id: "hitsounds", kind: "sound", preview: [] },
  { id: "uiSounds", kind: "sound", preview: [] },
];

const IMG = "(@2x)?\\.(png|jpg|jpeg)$";
const SND = "\\.(wav|ogg|mp3)$";

const PATTERNS: Record<SkinGroupId, RegExp> = {
  cursor: new RegExp(`^(cursor|cursortrail|cursormiddle|cursor-smoke|cursor-ripple)${IMG}`, "i"),
  hitcircle: new RegExp(
    `^(hitcircle|hitcircleoverlay(-\\d+)?|hitcircleselect|approachcircle|lighting|sliderstartcircle|sliderstartcircleoverlay|sliderendcircle|sliderendcircleoverlay)${IMG}`,
    "i",
  ),
  numbers: new RegExp(`^default-\\d${IMG}`, "i"),
  slider: new RegExp(
    `^(sliderb\\d*|sliderb-nd|sliderb-spec|sliderfollowcircle(-\\d+)?|sliderscorepoint|sliderpoint10|sliderpoint30|reversearrow)${IMG}`,
    "i",
  ),
  judgements: new RegExp(`^(hit0|hit50|hit100|hit100k|hit300|hit300k|hit300g)(-\\d+)?${IMG}`, "i"),
  followpoint: new RegExp(`^followpoint(-\\d+)?${IMG}`, "i"),
  spinner: new RegExp(`^spinner-[a-z0-9-]+${IMG}`, "i"),
  scoreNumbers: new RegExp(`^score-(\\d|comma|dot|percent|x)${IMG}`, "i"),
  hitsounds: new RegExp(
    `^(normal|soft|drum)-(hit(normal|clap|finish|whistle)|slider(slide|tick|whistle))\\d*${SND}`,
    "i",
  ),
  uiSounds: new RegExp(
    `^(combobreak|applause|failsound|sectionpass|sectionfail|count[123]s|gos|readys|spinnerspin|spinnerbonus|menuhit|menuclick|menuback|click-short|click-short-confirm)${SND}`,
    "i",
  ),
};

export interface SkinFonts {
  hitCirclePrefix: string;
  scorePrefix: string;
}

export const DEFAULT_FONTS: SkinFonts = { hitCirclePrefix: "default", scorePrefix: "score" };

export function decodeSkinIni(data: Buffer): string {
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) return data.subarray(2).toString("utf16le");
  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
    const swapped = Buffer.from(data.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    return data.subarray(3).toString("utf-8");
  }
  return data.toString("utf-8");
}

export function parseSkinFonts(skinIni: string): SkinFonts {
  const fonts = { ...DEFAULT_FONTS };
  let section = "";
  for (const raw of skinIni.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^\[(.+)\]$/.exec(line);
    if (m) {
      section = m[1].toLowerCase();
      continue;
    }
    if (section !== "fonts") continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line
      .slice(i + 1)
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.?\//, "");
    if (!value) continue;
    if (key === "hitcircleprefix") fonts.hitCirclePrefix = value;
    if (key === "scoreprefix") fonts.scorePrefix = value;
  }
  return fonts;
}

export interface SkinFile {
  path: string;
  canonical: string;
}

export function canonicalName(path: string, fonts: SkinFonts): string | null {
  const lower = path.toLowerCase();
  const hit = fonts.hitCirclePrefix.toLowerCase() + "-";
  const score = fonts.scorePrefix.toLowerCase() + "-";
  if (fonts.hitCirclePrefix !== DEFAULT_FONTS.hitCirclePrefix && lower.startsWith(hit)) {
    return "default-" + path.slice(hit.length);
  }
  if (fonts.scorePrefix !== DEFAULT_FONTS.scorePrefix && lower.startsWith(score)) {
    return "score-" + path.slice(score.length);
  }
  return path.includes("/") ? null : path;
}

export function groupOf(canonical: string): SkinGroupId | null {
  for (const group of SKIN_GROUPS) if (PATTERNS[group.id].test(canonical)) return group.id;
  return null;
}

export function classifySkinFiles(files: string[], fonts: SkinFonts): Map<SkinGroupId, SkinFile[]> {
  const groups = new Map<SkinGroupId, SkinFile[]>(SKIN_GROUPS.map((g) => [g.id, []]));
  for (const path of files) {
    const canonical = canonicalName(path, fonts);
    if (!canonical) continue;
    const group = groupOf(canonical);
    if (group) groups.get(group)?.push({ path, canonical });
  }
  return groups;
}

export function targetPath(canonical: string, fonts: SkinFonts): string {
  if (/^default-/i.test(canonical)) return fonts.hitCirclePrefix + canonical.slice("default".length);
  if (/^score-/i.test(canonical)) return fonts.scorePrefix + canonical.slice("score".length);
  return canonical;
}

export function previewFile(group: SkinGroup, files: SkinFile[]): SkinFile | null {
  if (group.kind !== "image" || files.length === 0) return null;
  const byName = new Map(files.map((f) => [f.canonical.toLowerCase(), f]));
  for (const name of group.preview) {
    const hd = byName.get(name.replace(/\.png$/, "@2x.png"));
    if (hd) return hd;
    const sd = byName.get(name);
    if (sd) return sd;
  }
  return files.find((f) => /\.png$/i.test(f.canonical)) ?? files[0];
}

export function twinOf(path: string): string {
  return /@2x\.(png|jpe?g)$/i.test(path)
    ? path.replace(/@2x(\.(png|jpe?g))$/i, "$1")
    : path.replace(/(\.(png|jpe?g))$/i, "@2x$1");
}

export type MixAssignment = Partial<Record<SkinGroupId, string>>;

export function randomAssignment(
  availability: Map<string, Set<SkinGroupId>>,
  sources: string[],
  random: Random = Math.random,
  only?: SkinGroupId[],
  previous: MixAssignment = {},
): MixAssignment {
  const result: MixAssignment = { ...previous };
  for (const group of only ?? SKIN_GROUPS.map((g) => g.id)) {
    const candidates = sources.filter((s) => availability.get(s)?.has(group));
    if (candidates.length === 0) delete result[group];
    else result[group] = candidates[Math.floor(random() * candidates.length)];
  }
  return result;
}

export function mixedSkinIni(baseIni: string | null, name: string): string {
  const lines = (baseIni ?? "[General]\nAuthor: osu!coach\nVersion: latest\n").split(/\r?\n/);
  const out: string[] = [];
  let section = "";
  let wroteName = false;
  for (const line of lines) {
    const m = /^\s*\[(.+)\]\s*$/.exec(line);
    if (m) {
      if (section === "general" && !wroteName) {
        out.push(`Name: ${name}`);
        wroteName = true;
      }
      section = m[1].toLowerCase();
      out.push(line);
      continue;
    }
    const key = line.split(":")[0].trim().toLowerCase();
    if (section === "general" && key === "name") {
      out.push(`Name: ${name}`);
      wroteName = true;
      continue;
    }
    if (section === "fonts" && (key === "hitcircleprefix" || key === "scoreprefix" || key === "comboprefix")) continue;
    out.push(line);
  }
  if (!wroteName) {
    if (section === "general") out.push(`Name: ${name}`);
    else out.unshift("[General]", `Name: ${name}`, "");
  }
  return out.join("\r\n");
}
