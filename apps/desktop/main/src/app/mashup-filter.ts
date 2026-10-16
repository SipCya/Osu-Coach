/**
 * Pure builder for the ffmpeg `-filter_complex` graph that stitches several audio
 * segments into one track. No Node/Electron imports on purpose, so it can be unit
 * tested in isolation (jest is unavailable in this repo — see the tsc harness).
 *
 * Each segment is a slice [startMs, endMs] of one input, optionally re-timed (rate)
 * and faded in/out. Consecutive segments are joined either by a silent gap or by an
 * audio crossfade. Everything is normalised to a common sample rate / stereo layout
 * so concat and acrossfade never choke on mismatched formats.
 */

export interface MashupSegment {
  /** Index of this segment's `-i` input in the ffmpeg input list. */
  input: number;
  startMs: number;
  endMs: number;
  /** Playback rate (1 = unchanged). Values outside [0.5, 2] are chained automatically. */
  rate?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
}

export type MashupJoin = { type: "gap"; ms: number } | { type: "crossfade"; ms: number };

export interface MashupPlan {
  segments: MashupSegment[];
  /** joins[i] joins segments[i] and segments[i+1]; length should be segments.length - 1. */
  joins: MashupJoin[];
  sampleRate?: number;
}

export interface BuiltMashup {
  filterComplex: string;
  outLabel: string;
  totalMs: number;
}

const DEFAULT_SAMPLE_RATE = 44100;

/** ffmpeg's atempo only accepts 0.5–2.0, so a rate outside that is reached by chaining. */
function tempoChain(rate: number): string {
  const filters: string[] = [];
  let remaining = rate;
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(6)}`);
  return filters.join(",");
}

const s3 = (ms: number): string => (ms / 1000).toFixed(3);

/** Processed (output-timeline) duration of a segment in seconds, after the rate change. */
function segmentSeconds(seg: MashupSegment): number {
  const rate = seg.rate && seg.rate > 0 ? seg.rate : 1;
  const raw = Math.max(0, seg.endMs - seg.startMs) / 1000;
  return raw / rate;
}

/** Total duration of the stitched track, in milliseconds. */
export function mashupDurationMs(plan: MashupPlan): number {
  if (plan.segments.length === 0) return 0;
  let total = segmentSeconds(plan.segments[0]);
  for (let i = 1; i < plan.segments.length; i++) {
    const join = plan.joins[i - 1] ?? { type: "gap", ms: 0 };
    const segDur = segmentSeconds(plan.segments[i]);
    if (join.type === "crossfade") {
      const c = Math.min(Math.max(0, join.ms) / 1000, segmentSeconds(plan.segments[i - 1]), segDur);
      total += segDur - c;
    } else {
      total += Math.max(0, join.ms) / 1000 + segDur;
    }
  }
  return Math.round(total * 1000);
}

export function buildMashupFilter(plan: MashupPlan): BuiltMashup {
  if (plan.segments.length === 0) throw new Error("A mashup needs at least one segment");
  const sr = plan.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const aformat = `aformat=sample_rates=${sr}:channel_layouts=stereo`;
  const parts: string[] = [];
  const segSec: number[] = [];

  // Per-segment processing: trim → reset PTS → re-time → fades → normalise format.
  plan.segments.forEach((seg, i) => {
    const rate = seg.rate && seg.rate > 0 ? seg.rate : 1;
    const pSec = segmentSeconds(seg);
    segSec.push(pSec);
    const chain: string[] = [`atrim=start=${s3(seg.startMs)}:end=${s3(seg.endMs)}`, "asetpts=N/SR/TB"];
    if (Math.abs(rate - 1) > 1e-6) chain.push(tempoChain(rate));
    if (seg.fadeInMs && seg.fadeInMs > 0) chain.push(`afade=t=in:st=0:d=${s3(seg.fadeInMs)}`);
    if (seg.fadeOutMs && seg.fadeOutMs > 0) {
      const st = Math.max(0, pSec - seg.fadeOutMs / 1000);
      chain.push(`afade=t=out:st=${st.toFixed(3)}:d=${s3(seg.fadeOutMs)}`);
    }
    chain.push(aformat);
    parts.push(`[${seg.input}:a]${chain.join(",")}[sA${i}]`);
  });

  // Fold segments left-to-right, applying each join.
  let accLabel = "sA0";
  let step = 0;
  for (let i = 1; i < plan.segments.length; i++) {
    const join = plan.joins[i - 1] ?? { type: "gap", ms: 0 };
    const out = `m${++step}`;
    if (join.type === "crossfade") {
      const c = Math.min(Math.max(0, join.ms) / 1000, segSec[i - 1], segSec[i]);
      parts.push(`[${accLabel}][sA${i}]acrossfade=d=${c.toFixed(3)}:c1=tri:c2=tri[${out}]`);
    } else {
      const gap = Math.max(0, join.ms) / 1000;
      if (gap > 1e-6) {
        const sil = `sil${i}`;
        parts.push(`anullsrc=r=${sr}:cl=stereo,atrim=0:${gap.toFixed(3)},asetpts=N/SR/TB,${aformat}[${sil}]`);
        parts.push(`[${accLabel}][${sil}][sA${i}]concat=n=3:v=0:a=1[${out}]`);
      } else {
        parts.push(`[${accLabel}][sA${i}]concat=n=2:v=0:a=1[${out}]`);
      }
    }
    accLabel = out;
  }

  return { filterComplex: parts.join(";"), outLabel: accLabel, totalMs: mashupDurationMs(plan) };
}
