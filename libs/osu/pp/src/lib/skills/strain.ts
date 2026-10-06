import { clamp, lerp } from "@osujs/math";
import { OsuDifficultyHitObject } from "../diff";
import { sum } from "simple-statistics";

const REDUCED_STRAIN_BASELINE = 0.75;

interface StrainSkillParams {
  sectionDuration: number;
  strainDecay: (time: number) => number;
}

interface OsuStrainSkillParams extends StrainSkillParams {
  reducedSectionCount: number;

  decayWeight: number;

  difficultyMultiplier: number;
}

function calculateDifficultyValues(
  diffs: OsuDifficultyHitObject[],
  strains: number[],
  { sectionDuration, strainDecay }: StrainSkillParams,
  difficultyValueFromPeaks: (peaks: number[]) => number,
  onlyFinalValue: boolean,
): number[] {
  if (diffs.length === 0) return [];
  const calcSectionBegin = (sectionDuration: number, t: number) => Math.floor(t / sectionDuration) * sectionDuration;

  const peaks: number[] = [];
  const difficultyValues: number[] = [];

  let currentSectionBegin = calcSectionBegin(sectionDuration, diffs[0].startTime);
  let currentSectionPeak = 0;

  if (!onlyFinalValue) {
    difficultyValues.push(0);
  }

  for (let i = 1; i < diffs.length; i++) {
    const prevStartTime = diffs[i - 1].startTime;
    const currStartTime = diffs[i].startTime;

    while (currentSectionBegin + sectionDuration < currStartTime) {
      peaks.push(currentSectionPeak);
      currentSectionBegin += sectionDuration;
      currentSectionPeak = strains[i - 1] * strainDecay(currentSectionBegin - prevStartTime);
    }

    currentSectionPeak = Math.max(currentSectionPeak, strains[i]);

    if (onlyFinalValue && i + 1 < diffs.length) {
      continue;
    }
    const peaksWithCurrent = [...peaks, currentSectionPeak];
    difficultyValues.push(difficultyValueFromPeaks(peaksWithCurrent));
  }
  return difficultyValues;
}

export function calculateFlashlightDifficultyValues(
  diffs: OsuDifficultyHitObject[],
  strains: number[],
  strainSkillParams: StrainSkillParams,
  onlyFinalValue: boolean,
): number[] {
  function difficultyValueFromPeaks(peaks: number[]) {
    return sum(peaks) * 1.06;
  }

  return calculateDifficultyValues(diffs, strains, strainSkillParams, difficultyValueFromPeaks, onlyFinalValue);
}

export function calculateOsuStrainDifficultyValues(
  diffs: OsuDifficultyHitObject[],
  strains: number[],
  { reducedSectionCount, difficultyMultiplier, decayWeight, ...strainParams }: OsuStrainSkillParams,
  onlyFinalValue: boolean,
): number[] {
  const descending = (a: number, b: number) => b - a;

  function difficultyValueFromPeaks(peaks: number[]) {
    peaks.sort(descending);
    for (let i = 0; i < Math.min(peaks.length, reducedSectionCount); i++) {
      const scale = Math.log10(lerp(1, 10, clamp(i / reducedSectionCount, 0, 1)));
      peaks[i] *= lerp(REDUCED_STRAIN_BASELINE, 1.0, scale);
    }
    let weight = 1;

    peaks = peaks.filter((p) => p > 0);
    peaks.sort(descending);
    let difficultyValue = 0;
    for (const peak of peaks) {
      difficultyValue += peak * weight;
      weight *= decayWeight;
    }
    return difficultyValue * difficultyMultiplier;
  }

  return calculateDifficultyValues(diffs, strains, strainParams, difficultyValueFromPeaks, onlyFinalValue);
}
