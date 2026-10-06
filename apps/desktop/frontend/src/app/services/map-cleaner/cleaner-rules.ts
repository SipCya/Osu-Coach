export type CleanCategory =
  | "videos"
  | "storyboard"
  | "skin"
  | "hitsounds"
  | "backgrounds"
  | "modeStd"
  | "modeTaiko"
  | "modeCatch"
  | "modeMania"
  | "junk"
  | "uncommon";

export const CLEAN_CATEGORIES: CleanCategory[] = [
  "videos",
  "storyboard",
  "skin",
  "hitsounds",
  "backgrounds",
  "modeStd",
  "modeTaiko",
  "modeCatch",
  "modeMania",
  "junk",
  "uncommon",
];

const MODE_CATEGORIES: CleanCategory[] = ["modeStd", "modeTaiko", "modeCatch", "modeMania"];

export interface BeatmapRefs {
  mode: number;
  audio?: string;
  background?: string;
  video?: string;
  storyboard: string[];
}

const VIDEO_EXT = /\.(avi|wmv|flv|mp4|mpg|mpeg|mov|mkv|m4v|3gp|webm)$/i;
const IMAGE_EXT = /\.(png|jpg|jpeg|bmp)$/i;
const AUDIO_EXT = /\.(wav|ogg|mp3)$/i;
const COMMON_EXT = /\.(osu|osb|png|jpg|jpeg|bmp|mp3|ogg|wav|aac|txt|avi|wmv|flv|mp4|mpg|mpeg|mov|mkv|m4v|3gp|webm)$/i;
const JUNK_NAME = /^(thumbs\.db|desktop\.ini|\.ds_store)$/i;
const HITSOUND_NAME = /^(normal|soft|drum)-/i;
const SKIN_NAME = new RegExp(
  "^(" +
    [
      "applause",
      "approachcircle",
      "button-",
      "combobreak",
      "comboburst",
      "count\\d",
      "cursor",
      "default-",
      "fail-background",
      "failsound",
      "followpoint",
      "fruit-",
      "go\\.|go@",
      "gos\\.|gos@",
      "hit0",
      "hit50",
      "hit100",
      "hit300",
      "hitcircle",
      "inputoverlay-",
      "lighting",
      "mania-",
      "menu-",
      "particle",
      "pause-",
      "pippidon",
      "play-",
      "ranking-",
      "ready",
      "reversearrow",
      "score-",
      "scorebar-",
      "section-",
      "sectionfail",
      "sectionpass",
      "selection-",
      "sliderb",
      "sliderfollowcircle",
      "sliderscorepoint",
      "spinner-",
      "spinnerbonus",
      "spinnerspin",
      "star\\.|star@|star2",
      "taiko-",
      "taikobigcircle",
      "taikohitcircle",
    ].join("|") +
    ")",
  "i",
);

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export function normalizeRef(path: string): string {
  return path
    .trim()
    .replace(/^"|"$/g, "")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .toLowerCase();
}

function splitCsv(line: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    if (ch === "," && !quoted) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

interface EventRefs {
  background?: string;
  video?: string;
  storyboard: string[];
}

function parseEvents(lines: string[]): EventRefs {
  const refs: EventRefs = { storyboard: [] };
  for (const raw of lines) {
    if (!raw || raw.startsWith(" ") || raw.startsWith("_") || raw.startsWith("//")) continue;
    const parts = splitCsv(raw.trim());
    const type = parts[0];
    if (type === "0" && parts.length >= 3) {
      refs.background ??= normalizeRef(parts[2]);
    } else if ((type === "1" || type === "Video") && parts.length >= 3) {
      refs.video ??= normalizeRef(parts[2]);
    } else if ((type === "Sprite" || type === "4") && parts.length >= 4) {
      refs.storyboard.push(normalizeRef(parts[3]));
    } else if ((type === "Animation" || type === "6") && parts.length >= 7) {
      const path = normalizeRef(parts[3]);
      const frames = Math.min(Number(parts[6]) || 0, 1000);
      const dot = path.lastIndexOf(".");
      const [name, ext] = dot > path.lastIndexOf("/") ? [path.slice(0, dot), path.slice(dot)] : [path, ""];
      for (let i = 0; i < frames; i++) refs.storyboard.push(`${name}${i}${ext}`);
    } else if ((type === "Sample" || type === "5") && parts.length >= 4) {
      refs.storyboard.push(normalizeRef(parts[3]));
    }
  }
  return refs;
}

function sectionLines(text: string, wanted: string): string[] {
  const lines: string[] = [];
  let section = "";
  for (const line of text.split(/\r?\n/)) {
    const m = /^\[(.+)\]\s*$/.exec(line.trim());
    if (m) section = m[1];
    else if (section === wanted) lines.push(line);
  }
  return lines;
}

export function parseOsuFile(text: string): BeatmapRefs {
  let mode = 0;
  let audio: string | undefined;
  for (const line of sectionLines(text, "General")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (key === "Mode") mode = Number(value) || 0;
    if (key === "AudioFilename" && value) audio = normalizeRef(value);
  }
  return { mode, audio, ...parseEvents(sectionLines(text, "Events")) };
}

export function parseStoryboardFile(text: string): string[] {
  const events = sectionLines(text, "Events");
  return parseEvents(events.length > 0 ? events : text.split(/\r?\n/)).storyboard;
}

export interface SetContents {
  files: string[];
  beatmaps: Map<string, BeatmapRefs>;
  storyboard: string[];
}

export interface SetAnalysis {
  removable: Map<string, CleanCategory>;
  missingBackgrounds: string[];
}

export function analyzeSet({ files, beatmaps, storyboard }: SetContents): SetAnalysis {
  const audio = new Set<string>();
  const backgrounds = new Set<string>();
  const videos = new Set<string>();
  const sb = new Set<string>(storyboard);
  for (const refs of beatmaps.values()) {
    if (refs.audio) audio.add(refs.audio);
    if (refs.background) backgrounds.add(refs.background);
    if (refs.video) videos.add(refs.video);
    refs.storyboard.forEach((s) => sb.add(s));
  }

  const removable = new Map<string, CleanCategory>();
  const existing = new Set<string>();
  for (const file of files) {
    const key = file.toLowerCase();
    existing.add(key);
    const name = baseName(key);

    let category: CleanCategory | null = null;
    if (key.endsWith(".osu")) {
      const refs = beatmaps.get(file);
      category = refs ? MODE_CATEGORIES[refs.mode] ?? null : null;
    } else if (key.endsWith(".osb") || audio.has(key)) {
      category = null;
    } else if (backgrounds.has(key)) {
      category = "backgrounds";
    } else if (videos.has(key) || VIDEO_EXT.test(name)) {
      category = "videos";
    } else if (sb.has(key)) {
      category = "storyboard";
    } else if (JUNK_NAME.test(name)) {
      category = "junk";
    } else if (HITSOUND_NAME.test(name) && AUDIO_EXT.test(name)) {
      category = "hitsounds";
    } else if (SKIN_NAME.test(name) && (IMAGE_EXT.test(name) || AUDIO_EXT.test(name))) {
      category = "skin";
    } else if (!COMMON_EXT.test(name)) {
      category = "uncommon";
    }
    if (category) removable.set(file, category);
  }

  const missingBackgrounds = [...backgrounds].filter((bg) => !existing.has(bg));
  return { removable, missingBackgrounds };
}

export const BLACK_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
  "base64",
);

export interface ReplayHeader {
  player: string;
  replayMD5: string;
}

export function readReplayHeader(header: Buffer): ReplayHeader | null {
  let pos = 5;
  const readString = () => {
    if (pos >= header.length) throw new Error("short header");
    const marker = header[pos++];
    if (marker === 0x00) return "";
    if (marker !== 0x0b) throw new Error("bad string");
    let length = 0;
    let shift = 0;
    for (;;) {
      const byte = header[pos++];
      length += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    if (pos + length > header.length) throw new Error("short header");
    const value = header.toString("utf8", pos, pos + length);
    pos += length;
    return value;
  };
  try {
    readString();
  } catch {
    return null;
  }
  let player: string;
  try {
    player = readString();
  } catch {
    return null;
  }
  try {
    return { player, replayMD5: readString() };
  } catch {
    return { player, replayMD5: "" };
  }
}
