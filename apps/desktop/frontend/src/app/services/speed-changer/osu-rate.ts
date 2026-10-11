export interface DifficultyValues {
  hp: number;
  cs: number;
  od: number;
  ar: number;
}

export interface BeatmapInfo {
  artist: string;
  title: string;
  creator: string;
  version: string;
  audioFilename: string;
  backgroundFile?: string;
  mode: number;
  difficulty: DifficultyValues;
  bpm: { main: number; min: number; max: number };
  lengthMs: number;
  objectCount: number;
}

export interface RateOptions {
  rate: number;
  difficulty: DifficultyValues;
  version: string;
  audioFilename: string;
}

const SECTION = /^\[(.+)\]\s*$/;

interface Line {
  section: string;
  text: string;
}

function splitLines(raw: string): Line[] {
  let section = "";
  return raw.split(/\r?\n/).map((text) => {
    const m = SECTION.exec(text.trim());
    if (m) section = m[1];
    return { section: m ? "" : section, text };
  });
}

function keyValue(text: string): [string, string] | null {
  const i = text.indexOf(":");
  if (i < 0) return null;
  return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
}

interface TimingPoint {
  time: number;
  beatLength: number;
  uninherited: boolean;
}

function parseTimingPoint(text: string): TimingPoint | null {
  const parts = text.split(",");
  if (parts.length < 2) return null;
  const time = Number(parts[0]);
  const beatLength = Number(parts[1]);
  if (!Number.isFinite(time) || !Number.isFinite(beatLength)) return null;
  const uninherited = parts.length >= 7 ? parts[6].trim() === "1" : beatLength > 0;
  return { time, beatLength, uninherited };
}

function objectEndTime(text: string): number | null {
  const parts = text.split(",");
  if (parts.length < 4) return null;
  const time = Number(parts[2]);
  const type = Number(parts[3]);
  if (type & 8 && parts.length > 5) return Number(parts[5]);
  if (type & 128 && parts.length > 5) return Number(parts[5].split(":")[0]);
  return time;
}

export function readBeatmapInfo(raw: string): BeatmapInfo {
  const info: BeatmapInfo = {
    artist: "",
    title: "",
    creator: "",
    version: "",
    audioFilename: "",
    mode: 0,
    difficulty: { hp: 5, cs: 5, od: 5, ar: -1 },
    bpm: { main: 0, min: 0, max: 0 },
    lengthMs: 0,
    objectCount: 0,
  };
  const timing: TimingPoint[] = [];
  let firstObject = Infinity;
  let lastObject = 0;

  for (const { section, text } of splitLines(raw)) {
    if (!text.trim() || text.startsWith("//")) continue;
    if (section === "General" || section === "Metadata" || section === "Difficulty") {
      const kv = keyValue(text);
      if (!kv) continue;
      const [key, value] = kv;
      switch (key) {
        case "AudioFilename":
          info.audioFilename = value;
          break;
        case "Mode":
          info.mode = Number(value) || 0;
          break;
        case "Artist":
          info.artist = value;
          break;
        case "Title":
          info.title = value;
          break;
        case "Creator":
          info.creator = value;
          break;
        case "Version":
          info.version = value;
          break;
        case "HPDrainRate":
          info.difficulty.hp = Number(value);
          break;
        case "CircleSize":
          info.difficulty.cs = Number(value);
          break;
        case "OverallDifficulty":
          info.difficulty.od = Number(value);
          break;
        case "ApproachRate":
          info.difficulty.ar = Number(value);
          break;
      }
    } else if (section === "Events" && !info.backgroundFile) {
      const m = /^0\s*,\s*0\s*,\s*"([^"]+)"/.exec(text.trim());
      if (m) info.backgroundFile = m[1];
    } else if (section === "TimingPoints") {
      const tp = parseTimingPoint(text);
      if (tp) timing.push(tp);
    } else if (section === "HitObjects") {
      const parts = text.split(",");
      const start = Number(parts[2]);
      const end = objectEndTime(text);
      if (Number.isFinite(start)) {
        info.objectCount++;
        firstObject = Math.min(firstObject, start);
        lastObject = Math.max(lastObject, end ?? start);
      }
    }
  }

  if (info.difficulty.ar < 0) info.difficulty.ar = info.difficulty.od;
  info.lengthMs = info.objectCount > 0 ? lastObject - firstObject : 0;

  const red = timing.filter((t) => t.uninherited && t.beatLength > 0).sort((a, b) => a.time - b.time);
  if (red.length > 0) {
    const durations = new Map<number, number>();
    red.forEach((t, i) => {
      const end = i + 1 < red.length ? red[i + 1].time : Math.max(lastObject, t.time);
      const bpm = Math.round((60000 / t.beatLength) * 100) / 100;
      durations.set(bpm, (durations.get(bpm) ?? 0) + Math.max(0, end - t.time));
    });
    const bpms = [...durations.keys()];
    const main = [...durations.entries()].sort((a, b) => b[1] - a[1])[0][0];
    info.bpm = { main, min: Math.min(...bpms), max: Math.max(...bpms) };
  }
  return info;
}

const scaleTime = (value: string, rate: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n / rate)) : value;
};

const formatDifficulty = (n: number) => String(Math.round(n * 10) / 10);

function scaleStoryboardCommand(text: string, rate: number): string {
  const indent = /^[ _]+/.exec(text)?.[0] ?? "";
  const parts = text.slice(indent.length).split(",");
  const event = parts[0];
  if (event === "L") {
    parts[1] = scaleTime(parts[1], rate);
  } else if (event === "T") {
    if (parts.length > 2) parts[2] = scaleTime(parts[2], rate);
    if (parts.length > 3) parts[3] = scaleTime(parts[3], rate);
  } else if (parts.length > 3) {
    parts[2] = scaleTime(parts[2], rate);
    if (parts[3] !== "") parts[3] = scaleTime(parts[3], rate);
  }
  return indent + parts.join(",");
}

function rewriteEvent(text: string, rate: number): string {
  if (/^[ _]/.test(text)) return scaleStoryboardCommand(text, rate);
  const parts = text.split(",");
  const type = parts[0].trim();
  if ((type === "2" || type === "Break") && parts.length >= 3) {
    parts[1] = scaleTime(parts[1], rate);
    parts[2] = scaleTime(parts[2], rate);
  } else if ((type === "Video" || type === "1" || type === "Sample" || type === "5") && parts.length >= 2) {
    parts[1] = scaleTime(parts[1], rate);
  }
  return parts.join(",");
}

function rewriteTimingPoint(text: string, rate: number): string {
  const parts = text.split(",");
  const tp = parseTimingPoint(text);
  if (!tp) return text;
  parts[0] = String(Math.round(tp.time / rate));
  if (tp.uninherited && tp.beatLength > 0) {
    parts[1] = String(tp.beatLength / rate);
  }
  return parts.join(",");
}

function rewriteHitObject(text: string, rate: number): string {
  const parts = text.split(",");
  if (parts.length < 4) return text;
  parts[2] = scaleTime(parts[2], rate);
  const type = Number(parts[3]);
  if (type & 8 && parts.length > 5) {
    parts[5] = scaleTime(parts[5], rate);
  } else if (type & 128 && parts.length > 5) {
    const [end, ...rest] = parts[5].split(":");
    parts[5] = [scaleTime(end, rate), ...rest].join(":");
  }
  return parts.join(",");
}

export function createRateChangedBeatmap(raw: string, options: RateOptions): string {
  const { rate, difficulty, version, audioFilename } = options;
  const out: string[] = [];
  const seen = new Set<string>();
  const lines = splitLines(raw);

  lines.forEach(({ section, text }) => {
    if (!text.trim() || text.startsWith("//") || section === "") {
      out.push(text);
      return;
    }
    if (section === "General" || section === "Editor" || section === "Metadata" || section === "Difficulty") {
      const kv = keyValue(text);
      if (!kv) {
        out.push(text);
        return;
      }
      const [key, value] = kv;
      seen.add(key);
      switch (key) {
        case "AudioFilename":
          out.push(`AudioFilename: ${audioFilename}`);
          return;
        case "PreviewTime":
          out.push(`PreviewTime: ${Number(value) >= 0 ? scaleTime(value, rate) : value}`);
          return;
        case "Bookmarks":
          out.push(
            `Bookmarks: ${value
              .split(",")
              .map((b) => scaleTime(b.trim(), rate))
              .join(",")}`,
          );
          return;
        case "Version":
          out.push(`Version:${version}`);
          return;
        case "BeatmapID":
          out.push("BeatmapID:0");
          return;
        case "Tags":
          out.push(`Tags:${value}${value.includes("osucoach") ? "" : " osucoach"}`);
          return;
        case "HPDrainRate":
          out.push(`HPDrainRate:${formatDifficulty(difficulty.hp)}`);
          return;
        case "CircleSize":
          out.push(`CircleSize:${formatDifficulty(difficulty.cs)}`);
          return;
        case "OverallDifficulty":
          out.push(`OverallDifficulty:${formatDifficulty(difficulty.od)}`);
          return;
        case "ApproachRate":
          out.push(`ApproachRate:${formatDifficulty(difficulty.ar)}`);
          return;
      }
      out.push(text);
      return;
    }
    if (section === "Events") out.push(rewriteEvent(text, rate));
    else if (section === "TimingPoints") out.push(rewriteTimingPoint(text, rate));
    else if (section === "HitObjects") out.push(rewriteHitObject(text, rate));
    else out.push(text);
  });

  if (!seen.has("ApproachRate")) {
    const i = out.findIndex((l) => /^OverallDifficulty\s*:/.test(l));
    if (i >= 0) out.splice(i + 1, 0, `ApproachRate:${formatDifficulty(difficulty.ar)}`);
  }
  return out.join("\r\n");
}

export function formatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}x`;
}

export function defaultVersionName(info: BeatmapInfo, rate: number): string {
  const bpm = Math.round(info.bpm.main * rate);
  return `${info.version} ${bpm}bpm ${formatRate(rate)}`;
}

const INVALID_FILE_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

export function osuFileName(info: BeatmapInfo, version: string): string {
  const name = `${info.artist} - ${info.title} (${info.creator}) [${version}].osu`;
  return name.replace(INVALID_FILE_CHARS, "");
}

export function rateAudioFileName(original: string, rate: number, changePitch: boolean): string {
  const dot = original.lastIndexOf(".");
  const base = dot > 0 ? original.slice(0, dot) : original;
  return `${base}_${Number(rate.toFixed(4))}x${changePitch ? "_nc" : ""}.mp3`.replace(INVALID_FILE_CHARS, "");
}
