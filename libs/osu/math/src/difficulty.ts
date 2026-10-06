import { float32 } from "./float32";

export function circleSizeToScale(CS: number) {
  return float32((1.0 - (0.7 * (CS - 5)) / 5) / 2);
}

export function difficultyRange(difficulty: number, min: number, mid: number, max: number): number {
  if (difficulty > 5.0) return mid + ((max - mid) * (difficulty - 5.0)) / 5.0;
  return difficulty < 5.0 ? mid - ((mid - min) * (5.0 - difficulty)) / 5.0 : mid;
}

export const PREEMPT_MIN = 450;

export function approachRateToApproachDuration(AR: number) {
  return difficultyRange(AR, 1800, 1200, PREEMPT_MIN);
}

export function approachDurationToApproachRate(approachDurationInMs: number) {
  return approachDurationInMs > 1200 ? (1800 - approachDurationInMs) / 120 : (1200 - approachDurationInMs) / 150 + 5;
}

export function difficultyRangeForOd(difficulty: number, range: { od0: number; od5: number; od10: number }): number {
  return difficultyRange(difficulty, range.od0, range.od5, range.od10);
}

export function hitWindowGreatToOD(hitWindowGreat: number) {
  return (80 - hitWindowGreat) / 6;
}

type HitWindows = number[];

const OSU_STD_HIT_WINDOW_RANGES: [number, number, number][] = [
  [80, 50, 20],
  [140, 100, 60],
  [200, 150, 100],
  [400, 400, 400],
];

export function hitWindowsForOD(overallDifficulty: number, lazerStyle?: boolean): HitWindows {
  function lazerHitWindowsForOD(od: number): HitWindows {
    return OSU_STD_HIT_WINDOW_RANGES.map(([od0, od5, od10]) => difficultyRange(od, od0, od5, od10));
  }

  if (lazerStyle) {
    return lazerHitWindowsForOD(overallDifficulty);
  }
  return lazerHitWindowsForOD(overallDifficulty).map((w) => w - 1);
}

export function overallDifficultyToHitWindowGreat(od: number) {
  const [od0, od5, od10] = OSU_STD_HIT_WINDOW_RANGES[0];
  return difficultyRange(od, od0, od5, od10);
}
