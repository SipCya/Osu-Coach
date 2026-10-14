import {
  BeatmapInfo,
  INVALID_FILE_CHARS,
  objectEndTime,
  parseTimingPoint,
  readBeatmapInfo,
  splitLines,
} from "../speed-changer/osu-rate";

const SECTION = /^\[(.+)\]\s*$/;

/** Lead-in kept before the first object and tail kept after the last one when trimming the audio. */
export const PRACTICE_LEAD_IN_MS = 2000;
export const PRACTICE_TAIL_MS = 1000;

export interface DifficultyFile {
  path: string;
  raw: string;
  info: BeatmapInfo;
  firstObjectMs: number;
  lastObjectMs: number;
}

export interface Segment {
  id: string;
  difficultyPath: string;
  startMs: number;
  endMs: number;
}

export interface ResolvedSegment {
  raw: string;
  startMs: number;
  endMs: number;
}

export interface PracticeOptions {
  baseRaw: string;
  segments: ResolvedSegment[];
  audioFilename: string;
  version: string;
  /** Milliseconds subtracted from every time. 0 keeps the original (untrimmed) audio. */
  audioStartMs: number;
}

/** Absolute start time of the first object and end time of the last one, in milliseconds. */
export function objectTimeRange(raw: string): { firstMs: number; lastMs: number } {
  let first = Infinity;
  let last = 0;
  for (const { section, text } of splitLines(raw)) {
    if (section !== "HitObjects" || !text.trim() || text.startsWith("//")) continue;
    const start = Number(text.split(",")[2]);
    const end = objectEndTime(text);
    if (Number.isFinite(start)) {
      first = Math.min(first, start);
      last = Math.max(last, end ?? start);
    }
  }
  return { firstMs: Number.isFinite(first) ? first : 0, lastMs: last };
}

export function readDifficultyFile(path: string, raw: string): DifficultyFile {
  const info = readBeatmapInfo(raw);
  const { firstMs, lastMs } = objectTimeRange(raw);
  return { path, raw, info, firstObjectMs: firstMs, lastObjectMs: lastMs };
}

interface RawTiming {
  time: number;
  uninherited: boolean;
  text: string;
}

function timingLines(raw: string): RawTiming[] {
  const out: RawTiming[] = [];
  for (const { section, text } of splitLines(raw)) {
    if (section !== "TimingPoints" || !text.trim() || text.startsWith("//")) continue;
    const tp = parseTimingPoint(text);
    if (tp) out.push({ time: tp.time, uninherited: tp.uninherited, text });
  }
  return out;
}

interface RawObject {
  time: number;
  text: string;
}

function objectLines(raw: string): RawObject[] {
  const out: RawObject[] = [];
  for (const { section, text } of splitLines(raw)) {
    if (section !== "HitObjects" || !text.trim() || text.startsWith("//")) continue;
    const time = Number(text.split(",")[2]);
    if (Number.isFinite(time)) out.push({ time, text });
  }
  return out;
}

function setTimingTime(text: string, time: number): string {
  const parts = text.split(",");
  parts[0] = String(Math.round(time));
  return parts.join(",");
}

function shiftObject(text: string, base: number): string {
  const parts = text.split(",");
  if (parts.length < 4) return text;
  parts[2] = String(Math.round(Number(parts[2]) - base));
  const type = Number(parts[3]);
  if (type & 8 && parts.length > 5) {
    parts[5] = String(Math.round(Number(parts[5]) - base));
  } else if (type & 128 && parts.length > 5) {
    const seg = parts[5].split(":");
    seg[0] = String(Math.round(Number(seg[0]) - base));
    parts[5] = seg.join(":");
  }
  return parts.join(",");
}

function shiftEvent(text: string, base: number): string | null {
  // Storyboard commands are indented; drop them, a practice cut rarely lines up with them.
  if (/^[ _]/.test(text)) return null;
  const parts = text.split(",");
  const type = parts[0].trim();
  if ((type === "2" || type === "Break") && parts.length >= 3) {
    const end = Number(parts[2]) - base;
    if (end < 0) return null;
    parts[1] = String(Math.round(Math.max(0, Number(parts[1]) - base)));
    parts[2] = String(Math.round(end));
    return parts.join(",");
  }
  if ((type === "Video" || type === "1" || type === "Sample" || type === "5") && parts.length >= 2) {
    parts[1] = String(Math.round(Number(parts[1]) - base));
  }
  return parts.join(",");
}

/**
 * Timing points for the output map. Every segment is re-stated with the red (BPM) and green (SV)
 * point active at its start, then keeps the points that fall inside its range, so a section plays
 * correctly even when it starts in the middle of a timing section or borrows another difficulty.
 */
function buildTiming(segments: ResolvedSegment[], base: number): string[] {
  const collected: { time: number; text: string }[] = [];
  for (const seg of segments) {
    const lines = timingLines(seg.raw);
    const activeRed = lines.filter((t) => t.uninherited && t.time <= seg.startMs).pop();
    const activeGreen = lines.filter((t) => !t.uninherited && t.time <= seg.startMs).pop();
    if (activeRed) collected.push({ time: seg.startMs, text: setTimingTime(activeRed.text, seg.startMs) });
    if (activeGreen) collected.push({ time: seg.startMs + 0.001, text: setTimingTime(activeGreen.text, seg.startMs) });
    for (const t of lines) {
      if (t.time > seg.startMs && t.time <= seg.endMs) collected.push({ time: t.time, text: t.text });
    }
  }
  collected.sort((a, b) => a.time - b.time);
  return collected.map((c) => setTimingTime(c.text, c.time - base));
}

function buildObjects(segments: ResolvedSegment[], base: number): string[] {
  const out: string[] = [];
  for (const seg of segments) {
    for (const o of objectLines(seg.raw)) {
      if (o.time >= seg.startMs && o.time <= seg.endMs) out.push(shiftObject(o.text, base));
    }
  }
  return out;
}

export function createPracticeBeatmap(options: PracticeOptions): string {
  const { baseRaw, segments, audioFilename, version, audioStartMs } = options;
  const builtTiming = buildTiming(segments, audioStartMs);
  const builtObjects = buildObjects(segments, audioStartMs);
  const out: string[] = [];

  for (const { section, text } of splitLines(baseRaw)) {
    const header = SECTION.exec(text.trim());
    if (header) {
      out.push(text);
      if (header[1] === "TimingPoints") out.push(...builtTiming);
      else if (header[1] === "HitObjects") out.push(...builtObjects);
      continue;
    }
    if (section === "TimingPoints" || section === "HitObjects") continue;

    if (section === "Events") {
      if (!text.trim() || text.startsWith("//")) {
        out.push(text);
        continue;
      }
      const shifted = shiftEvent(text, audioStartMs);
      if (shifted !== null) out.push(shifted);
      continue;
    }

    if (section === "General" || section === "Editor" || section === "Metadata" || section === "Difficulty") {
      const i = text.indexOf(":");
      if (i < 0) {
        out.push(text);
        continue;
      }
      const key = text.slice(0, i).trim();
      const value = text.slice(i + 1).trim();
      switch (key) {
        case "AudioFilename":
          out.push(`AudioFilename: ${audioFilename}`);
          continue;
        case "AudioLeadIn":
          out.push("AudioLeadIn: 0");
          continue;
        case "PreviewTime": {
          const preview = Number(value) >= 0 ? Math.round(Number(value) - audioStartMs) : -1;
          out.push(`PreviewTime: ${preview >= 0 ? preview : -1}`);
          continue;
        }
        case "Version":
          out.push(`Version:${version}`);
          continue;
        case "BeatmapID":
          out.push("BeatmapID:0");
          continue;
        case "Tags":
          out.push(`Tags:${value}${value.includes("osucoach") ? "" : " osucoach"}`);
          continue;
        default:
          out.push(text);
          continue;
      }
    }

    out.push(text);
  }

  return out.join("\r\n");
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function practiceFileName(info: BeatmapInfo, version: string): string {
  return `${info.artist} - ${info.title} (${info.creator}) [${version}].osu`.replace(INVALID_FILE_CHARS, "");
}

export function practiceAudioFileName(original: string, version: string): string {
  const dot = original.lastIndexOf(".");
  const ext = dot > 0 ? original.slice(dot) : ".mp3";
  return `practice ${version}${ext}`.replace(INVALID_FILE_CHARS, "");
}
