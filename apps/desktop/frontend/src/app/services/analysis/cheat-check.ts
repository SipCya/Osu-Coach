import { OsuAction, ReplayFrame } from "@osujs/core";

/**
 * Heuristic replay checks (timewarp, snaps, unstable rate, replay similarity).
 * These produce indicators, NOT proof: thresholds are approximate and false positives happen,
 * exactly like circleguard. The UI presents them as hints for a human to review.
 */

export interface HistogramBucket {
  ms: number;
  count: number;
}

export interface FrametimeReport {
  frameCount: number;
  medianMs: number;
  meanMs: number;
  impliedFps: number;
  cv: number; // coefficient of variation (std / mean)
  histogram: HistogramBucket[];
  suspicious: boolean;
}

export interface Snap {
  time: number;
  angleDeg: number;
  distance: number;
}

export interface SnapReport {
  count: number;
  snaps: Snap[];
}

export type SimilarityVerdict = "identical" | "similar" | "different" | "no-overlap";

export interface SimilarityReport {
  meanDistance: number;
  overlapMs: number;
  samples: number;
  verdict: SimilarityVerdict;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function standardDeviation(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Unstable rate = standard deviation of hit errors × 10 (osu! convention). */
export function unstableRate(offsets: number[]): number {
  return standardDeviation(offsets) * 10;
}

export function meanOf(values: number[]): number {
  return mean(values);
}

export interface Bin {
  from: number;
  to: number;
  count: number;
}

/** Simple histogram of values into fixed-width bins over [min, max]. */
export function histogram(values: number[], binSize: number, min: number, max: number): Bin[] {
  const bins: Bin[] = [];
  const n = Math.max(1, Math.ceil((max - min) / binSize));
  for (let i = 0; i < n; i++) bins.push({ from: min + i * binSize, to: min + (i + 1) * binSize, count: 0 });
  for (const v of values) {
    const idx = Math.min(bins.length - 1, Math.max(0, Math.floor((v - min) / binSize)));
    bins[idx].count++;
  }
  return bins;
}

/** Highest cursor speed between consecutive frames, in osu!px per millisecond. */
export function maxCursorSpeed(frames: ReplayFrame[]): number {
  let max = 0;
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].time - frames[i - 1].time;
    if (dt <= 0) continue;
    const d = Math.hypot(frames[i].position.x - frames[i - 1].position.x, frames[i].position.y - frames[i - 1].position.y);
    max = Math.max(max, d / dt);
  }
  return max;
}

export interface SpeedPoint {
  t: number; // ms
  speed: number; // px/ms (peak within the bucket)
}

/**
 * Downsamples the per-frame cursor speed into `buckets` time slots, keeping the PEAK speed in
 * each — so a single impossibly-fast frame still shows up as a spike in the over-time chart.
 */
export function cursorSpeedSeries(frames: ReplayFrame[], buckets = 260): SpeedPoint[] {
  if (frames.length < 2) return [];
  const t0 = frames[0].time;
  const span = Math.max(1, frames[frames.length - 1].time - t0);
  const peak = new Float64Array(buckets);
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].time - frames[i - 1].time;
    if (dt <= 0) continue;
    const d = Math.hypot(frames[i].position.x - frames[i - 1].position.x, frames[i].position.y - frames[i - 1].position.y);
    const b = Math.min(buckets - 1, Math.max(0, Math.floor(((frames[i].time - t0) / span) * buckets)));
    peak[b] = Math.max(peak[b], d / dt);
  }
  const out: SpeedPoint[] = [];
  for (let b = 0; b < buckets; b++) out.push({ t: t0 + ((b + 0.5) / buckets) * span, speed: peak[b] });
  return out;
}

/**
 * Number of consecutive-frame segments whose cursor speed exceeds `maxPxPerMs`.
 * A fast human flick, coarsely sampled, spikes a handful of times; an aimbot teleports
 * on many objects. So a HIGH COUNT is the real signal — a single spike is legit, which
 * is why the flag counts segments instead of looking at the peak speed alone.
 */
export function fastCursorSegments(frames: ReplayFrame[], maxPxPerMs = 50): number {
  let count = 0;
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].time - frames[i - 1].time;
    if (dt <= 0) continue;
    const d = Math.hypot(frames[i].position.x - frames[i - 1].position.x, frames[i].position.y - frames[i - 1].position.y);
    if (d / dt > maxPxPerMs) count++;
  }
  return count;
}

/**
 * How long each key stayed held for the circles that were hit, in ms.
 * Relax/replay-bots tend to produce unnaturally consistent hold durations.
 */
interface KeyInterval {
  key: number;
  start: number;
  end: number;
}

function keyIntervals(frames: ReplayFrame[]): KeyInterval[] {
  const intervals: KeyInterval[] = [];
  const held: Record<number, number | null> = { [OsuAction.leftButton]: null, [OsuAction.rightButton]: null };
  for (const f of frames) {
    for (const key of [OsuAction.leftButton, OsuAction.rightButton]) {
      const down = f.actions.includes(key);
      if (down && held[key] === null) held[key] = f.time;
      else if (!down && held[key] !== null) {
        intervals.push({ key, start: held[key] as number, end: f.time });
        held[key] = null;
      }
    }
  }
  return intervals.sort((a, b) => a.start - b.start);
}

/** For each hit, the duration (ms) of the nearest key press, split by which key it was. */
export function keyHoldDurationsByKey(frames: ReplayFrame[], hitTimes: number[]): { left: number[]; right: number[] } {
  const intervals = keyIntervals(frames);
  const left: number[] = [];
  const right: number[] = [];
  for (const t of hitTimes) {
    let best: KeyInterval | null = null;
    let bestDist = Infinity;
    for (const iv of intervals) {
      const d = Math.abs(iv.start - t);
      if (d < bestDist) {
        bestDist = d;
        best = iv;
      }
    }
    if (best && bestDist < 100) {
      const dur = Math.max(0, best.end - best.start);
      (best.key === OsuAction.leftButton ? left : right).push(dur);
    }
  }
  return { left, right };
}

export function keyHoldDurations(frames: ReplayFrame[], hitTimes: number[]): number[] {
  const { left, right } = keyHoldDurationsByKey(frames, hitTimes);
  return [...left, ...right];
}

/** Positive frame-to-frame time deltas, dropping the seek/seed frames and pauses. */
export function frameDeltas(frames: ReplayFrame[]): number[] {
  const times = frames
    .map((f) => f.time)
    .filter((t) => t >= 0)
    .sort((a, b) => a - b);
  const deltas: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const dt = times[i] - times[i - 1];
    if (dt > 0 && dt < 1000) deltas.push(dt);
  }
  return deltas;
}

export function analyzeFrametimes(frames: ReplayFrame[]): FrametimeReport {
  const deltas = frameDeltas(frames);
  const med = median(deltas);
  const avg = mean(deltas);
  const cv = avg > 0 ? standardDeviation(deltas) / avg : 0;

  const buckets: HistogramBucket[] = [];
  const maxMs = 34;
  for (let ms = 0; ms <= maxMs; ms += 2) buckets.push({ ms, count: 0 });
  const overflow: HistogramBucket = { ms: maxMs + 2, count: 0 };
  for (const dt of deltas) {
    if (dt > maxMs + 1) overflow.count++;
    else buckets[Math.min(buckets.length - 1, Math.floor(dt / 2))].count++;
  }
  buckets.push(overflow);

  // Very weak heuristic: only flag physically implausible, very regular, very fast frames.
  const suspicious = med > 0 && med < 8 && cv < 0.2;

  return {
    frameCount: deltas.length,
    medianMs: med,
    meanMs: avg,
    impliedFps: med > 0 ? 1000 / med : 0,
    cv,
    histogram: buckets,
    suspicious,
  };
}

export interface SnapOptions {
  maxAngleDeg: number; // flag turns sharper than this
  minDistance: number; // osu!px, both legs must exceed this
  maxFrames: number; // cap on reported snaps
}

export const DEFAULT_SNAP_OPTIONS: SnapOptions = { maxAngleDeg: 8, minDistance: 10, maxFrames: 50 };

export function analyzeSnaps(frames: ReplayFrame[], options: SnapOptions = DEFAULT_SNAP_OPTIONS): SnapReport {
  const snaps: Snap[] = [];
  for (let i = 1; i < frames.length - 1; i++) {
    const p0 = frames[i - 1].position;
    const p1 = frames[i].position;
    const p2 = frames[i + 1].position;
    const ux = p0.x - p1.x;
    const uy = p0.y - p1.y;
    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    if (lu < options.minDistance || lv < options.minDistance) continue;
    const cos = (ux * vx + uy * vy) / (lu * lv);
    const angleDeg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (angleDeg < options.maxAngleDeg) {
      snaps.push({ time: frames[i].time, angleDeg, distance: Math.min(lu, lv) });
    }
  }
  snaps.sort((a, b) => a.angleDeg - b.angleDeg);
  return { count: snaps.length, snaps: snaps.slice(0, options.maxFrames) };
}

/** Samples a cursor position at an arbitrary time by linear interpolation; the index is kept
 * across calls (monotonically increasing time) so sampling a whole replay stays O(n). */
class CursorSampler {
  private index = 0;
  constructor(private readonly frames: ReplayFrame[]) {}

  positionAt(time: number): { x: number; y: number } | null {
    const frames = this.frames;
    if (frames.length === 0) return null;
    while (this.index < frames.length - 1 && frames[this.index + 1].time <= time) this.index++;
    const a = frames[this.index];
    const b = frames[Math.min(frames.length - 1, this.index + 1)];
    if (time < a.time || b.time < time) {
      if (time < frames[0].time || time > frames[frames.length - 1].time) return null;
    }
    if (b.time === a.time) return { x: a.position.x, y: a.position.y };
    const f = Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time)));
    return { x: a.position.x + (b.position.x - a.position.x) * f, y: a.position.y + (b.position.y - a.position.y) * f };
  }
}

function timeBounds(frames: ReplayFrame[]): { min: number; max: number } {
  const times = frames.map((f) => f.time).filter((t) => t >= 0);
  return { min: times.length ? Math.min(...times) : 0, max: times.length ? Math.max(...times) : 0 };
}

// --- Suspicion flags -------------------------------------------------------

export type Severity = "low" | "medium" | "high";

export interface Flag {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}

export interface FlagInput {
  frametime: FrametimeReport;
  offsets: number[];
  holdDurations: number[];
  leftHolds: number[];
  rightHolds: number[];
  snaps: Snap[];
  maxCursorSpeed: number;
  fastCursorSegments: number;
}

/** Fraction of the dominant histogram bin (how concentrated the values are). */
function dominantRatio(values: number[], binSize: number): number {
  if (values.length === 0) return 0;
  const max = Math.max(...values);
  const bins = histogram(values, binSize, 0, Math.max(binSize, Math.ceil(max / binSize) * binSize));
  const top = Math.max(...bins.map((b) => b.count));
  return top / values.length;
}

/** Fraction of frame times below a physically-implausible threshold. */
export function fastFrameRatio(frametime: FrametimeReport, thresholdMs = 8): number {
  if (frametime.frameCount === 0) return 0;
  const below = frametime.histogram.filter((b) => b.ms < thresholdMs).reduce((a, b) => a + b.count, 0);
  return below / frametime.frameCount;
}

/**
 * Heuristic suspicion flags. Thresholds are conservative and approximate — these are hints, not proof.
 */
export function computeCheatFlags(input: FlagInput): Flag[] {
  const flags: Flag[] = [];
  const { frametime, offsets, holdDurations, leftHolds, rightHolds, snaps, maxCursorSpeed, fastCursorSegments } = input;

  // Timewarp: only flag physically implausible, very regular, very fast frame times
  // (kept strict because high-refresh monitors legitimately produce low frame times).
  if (frametime.frameCount > 100 && frametime.medianMs > 0 && frametime.medianMs < 4 && frametime.cv < 0.2) {
    flags.push({
      id: "timewarp",
      severity: "high",
      title: "Possible timewarp",
      detail: `Median frame time ${frametime.medianMs.toFixed(1)}ms and very regular — implausibly fast.`,
    });
  }

  // Unstable rate: suspiciously low (too consistent).
  if (offsets.length >= 20) {
    const ur = unstableRate(offsets);
    if (ur > 0 && ur < 35) {
      flags.push({
        id: "low-ur",
        severity: "high",
        title: "Extremely low unstable rate",
        detail: `UR ${ur.toFixed(1)} — implausibly consistent (strong relax/bot hint).`,
      });
    } else if (ur < 45) {
      flags.push({
        id: "low-ur",
        severity: "medium",
        title: "Very low unstable rate — possible cheat",
        detail: `UR ${ur.toFixed(1)} — unusually consistent; worth a closer look.`,
      });
    }
  }

  // Near-zero hold times: humans release in ~20-30ms min; ~0ms = input sent/released same frame
  // (common bug in ESP32-based hardware "tap assist" cheats).
  if (holdDurations.length >= 20) {
    const nearZero = holdDurations.filter((d) => d <= 5).length / holdDurations.length;
    if (nearZero > 0.1) {
      flags.push({
        id: "zero-hold",
        severity: "high",
        title: "Near-zero key hold times",
        detail: `${Math.round(nearZero * 100)}% of holds are ~0ms — impossible for a human (hardware-cheat signature).`,
      });
    }
  }

  // Uniform key holds, checked PER KEY (a bot/macro may lock only one finger to a fixed value).
  const checkUniform = (vals: number[], label: string) => {
    if (vals.length < 20) return;
    const m = mean(vals);
    const cv = m > 0 ? standardDeviation(vals) / m : 0;
    const dom = dominantRatio(vals, 3);
    if (cv < 0.08 || dom > 0.8) {
      flags.push({
        id: `uniform-${label}`,
        severity: "high",
        title: `Near-identical ${label} key holds`,
        detail: `${label} holds are extremely uniform (dominant bin ${Math.round(dom * 100)}%, cv ${cv.toFixed(
          2,
        )}) — auto-clicker/bot hint.`,
      });
    } else if (cv < 0.15 || dom > 0.6) {
      flags.push({
        id: `uniform-${label}`,
        severity: "medium",
        title: `Very uniform ${label} key holds`,
        detail: `${label} holds are quite uniform (dominant bin ${Math.round(dom * 100)}%).`,
      });
    }
  };
  checkUniform(leftHolds, "left");
  checkUniform(rightHolds, "right");

  // Cursor snaps.
  if (snaps.length > 150) {
    flags.push({ id: "snaps", severity: "high", title: "Many cursor snaps", detail: `${snaps.length} sharp reversals.` });
  } else if (snaps.length > 60) {
    flags.push({
      id: "snaps",
      severity: "medium",
      title: "Several cursor snaps",
      detail: `${snaps.length} sharp reversals.`,
    });
  }

  // Impossibly fast cursor: flag repeated teleport-like moves, not a single sampling
  // spike from a fast flick (that is legit and used to cause false positives).
  if (fastCursorSegments >= 30) {
    flags.push({
      id: "cursor-speed",
      severity: "high",
      title: "Impossibly fast cursor",
      detail: `${fastCursorSegments} segments over 50 px/ms (peak ${maxCursorSpeed.toFixed(1)} px/ms).`,
    });
  } else if (fastCursorSegments >= 10) {
    flags.push({
      id: "cursor-speed",
      severity: "medium",
      title: "Very fast cursor movement",
      detail: `${fastCursorSegments} segments over 50 px/ms (peak ${maxCursorSpeed.toFixed(1)} px/ms).`,
    });
  }

  return flags;
}

export type VerdictLevel = "legit" | "review" | "suspicious";

/** One overall verdict from the flags: any high → suspicious, any flag → review, none → legit. */
export function cheatVerdict(flags: Flag[]): VerdictLevel {
  if (flags.some((f) => f.severity === "high")) return "suspicious";
  if (flags.length > 0) return "review";
  return "legit";
}

export function compareReplays(a: ReplayFrame[], b: ReplayFrame[], stepMs = 25): SimilarityReport {
  const ba = timeBounds(a);
  const bb = timeBounds(b);
  const start = Math.max(ba.min, bb.min);
  const end = Math.min(ba.max, bb.max);
  if (end <= start) return { meanDistance: Infinity, overlapMs: 0, samples: 0, verdict: "no-overlap" };

  const sa = new CursorSampler(a);
  const sb = new CursorSampler(b);
  let sum = 0;
  let n = 0;
  for (let t = start; t <= end; t += stepMs) {
    const pa = sa.positionAt(t);
    const pb = sb.positionAt(t);
    if (pa && pb) {
      sum += Math.hypot(pa.x - pb.x, pa.y - pb.y);
      n++;
    }
  }
  const meanDistance = n ? sum / n : Infinity;
  const verdict: SimilarityVerdict = meanDistance < 2 ? "identical" : meanDistance < 15 ? "similar" : "different";
  return { meanDistance, overlapMs: end - start, samples: n, verdict };
}
