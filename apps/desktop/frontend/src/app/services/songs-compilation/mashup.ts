import { SongEntry } from "./library";

/**
 * Mashup plan mirrored from the main-process `mashup-filter.ts`. Kept as a plain
 * structure because it crosses the IPC boundary (`compileMashup`); the main side
 * owns the ffmpeg graph and the authoritative duration maths.
 */
export interface MashupSegment {
  input: number;
  startMs: number;
  endMs: number;
  rate?: number;
  gain?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
}

export type MashupJoin = { type: "gap"; ms: number } | { type: "crossfade"; ms: number };

export interface MashupPlan {
  segments: MashupSegment[];
  joins: MashupJoin[];
  sampleRate?: number;
  loudnorm?: boolean;
}

/** UI-facing segment: a chosen slice of one library song plus its effects and the join after it. */
export interface CompSegment {
  id: string;
  song: SongEntry;
  /** Full length of the source audio, once known (ms). 0 until decoded. */
  durationMs: number;
  startMs: number;
  endMs: number;
  rate: number;
  gain: number;
  fadeInMs: number;
  fadeOutMs: number;
  /** How this segment joins the following one (ignored for the last segment). */
  joinAfter: MashupJoin;
}

export function makeSegment(id: string, song: SongEntry, durationMs: number): CompSegment {
  return {
    id,
    song,
    durationMs,
    startMs: 0,
    endMs: durationMs,
    rate: 1,
    gain: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    joinAfter: { type: "gap", ms: 0 },
  };
}

/** Processed (output-timeline) length of one segment in ms, after the rate change. */
export function segmentOutputMs(seg: CompSegment): number {
  const rate = seg.rate > 0 ? seg.rate : 1;
  return Math.max(0, seg.endMs - seg.startMs) / rate;
}

/**
 * Live estimate of the finished mashup length. Computed in seconds exactly like
 * mashupDurationMs on the main side, so the preview never drifts from the real graph.
 */
export function estimateDurationMs(segs: CompSegment[]): number {
  if (segs.length === 0) return 0;
  const sec = (s: CompSegment) => Math.max(0, s.endMs - s.startMs) / 1000 / (s.rate > 0 ? s.rate : 1);
  let total = sec(segs[0]);
  for (let i = 1; i < segs.length; i++) {
    const join = segs[i - 1].joinAfter;
    const dur = sec(segs[i]);
    if (join.type === "crossfade") {
      const c = Math.min(Math.max(0, join.ms) / 1000, sec(segs[i - 1]), dur);
      total += dur - c;
    } else {
      total += Math.max(0, join.ms) / 1000 + dur;
    }
  }
  return Math.round(total * 1000);
}

/** Turn the UI segments into the `{ inputs, plan }` payload for the `compileMashup` IPC call. */
export function toPlanAndInputs(segs: CompSegment[], loudnorm = false): { inputs: string[]; plan: MashupPlan } {
  const inputs = segs.map((s) => s.song.audioPath);
  const segments: MashupSegment[] = segs.map((s, i) => ({
    input: i,
    startMs: s.startMs,
    endMs: s.endMs,
    rate: s.rate,
    gain: s.gain,
    fadeInMs: s.fadeInMs,
    fadeOutMs: s.fadeOutMs,
  }));
  const joins: MashupJoin[] = segs.slice(0, -1).map((s) => s.joinAfter);
  return { inputs, plan: { segments, joins, loudnorm } };
}
