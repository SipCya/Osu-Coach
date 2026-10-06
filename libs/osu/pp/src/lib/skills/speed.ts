import { isSlider, isSpinner, OsuHitObject } from "@osujs/core";
import { OsuDifficultyHitObject } from "../diff";
import { clamp } from "@osujs/math";
import { calculateOsuStrainDifficultyValues } from "./strain";

const single_spacing_threshold = 125;
const rhythm_multiplier = 0.75;
const history_time_max = 5000;
const min_speed_bonus = 75;
const speed_balancing_factor = 40;

const skillMultiplier = 1375;
const strainDecayBase = 0.3;

const strainDecay = (ms: number) => Math.pow(strainDecayBase, ms / 1000);

interface SpeedInfo {
  strains: number[];
  relevantNoteCounts: number[];
}

function calculateSpeedInfo(
  hitObjects: OsuHitObject[],
  diffs: OsuDifficultyHitObject[],
  onlyFinalRelevantCountValue: boolean,
): SpeedInfo {
  let currentStrain = 0;
  const strains = [0];

  const relevantNoteCounts: number[] = [];
  if (!onlyFinalRelevantCountValue) relevantNoteCounts.push(0);
  let maxStrain = 0;

  for (let i = 1; i < hitObjects.length; i++) {
    const current = hitObjects[i];

    const diffCurrent = diffs[i];
    const diffPrev = diffs[i - 1];
    const diffNext: OsuDifficultyHitObject | undefined = diffs[i + 1];

    const previous = (j: number) => diffs[i - 1 - j];
    const previousHitObject = (j: number) => hitObjects[i - 1 - j];

    const speedEvaluateDifficultyOf = (function () {
      if (isSpinner(current)) return 0;

      let strainTime = diffCurrent.strainTime;
      let doubletapness = 1;

      if (diffNext !== undefined) {
        const currDeltaTime = Math.max(1, diffCurrent.deltaTime);
        const nextDeltaTime = Math.max(1, diffNext.deltaTime);
        const deltaDifference = Math.abs(nextDeltaTime - currDeltaTime);
        const speedRatio = currDeltaTime / Math.max(currDeltaTime, deltaDifference);
        const windowRatio = Math.pow(Math.min(1, currDeltaTime / diffCurrent.hitWindowGreat), 2);
        doubletapness = Math.pow(speedRatio, 1 - windowRatio);
      }

      strainTime /= clamp(strainTime / diffCurrent.hitWindowGreat / 0.93, 0.92, 1);

      let speedBonus = 1.0;

      if (strainTime < min_speed_bonus)
        speedBonus = 1 + 0.75 * Math.pow((min_speed_bonus - strainTime) / speed_balancing_factor, 2);

      const travelDistance = diffPrev.travelDistance;
      const distance = Math.min(single_spacing_threshold, travelDistance + diffCurrent.minimumJumpDistance);

      return (
        ((speedBonus + speedBonus * Math.pow(distance / single_spacing_threshold, 3.5)) * doubletapness) / strainTime
      );
    })();

    const currentRhythm = (function () {
      if (isSpinner(current)) return 0;

      let previousIslandSize = 0;

      let rhythmComplexitySum = 0;
      let islandSize = 1;
      let startRatio = 0;

      let firstDeltaSwitch = false;

      const historicalNoteCount = Math.min(i - 1, 32);
      let rhythmStart = 0;

      while (
        rhythmStart < historicalNoteCount - 2 &&
        diffCurrent.startTime - previous(rhythmStart).startTime < history_time_max
      )
        rhythmStart++;

      for (let j = rhythmStart; j > 0; j--) {
        const currObj = previous(j - 1);
        const prevObj = previous(j);
        const lastObj = previous(j + 1);

        let currHistoricalDecay = (history_time_max - (diffCurrent.startTime - currObj.startTime)) / history_time_max;
        currHistoricalDecay = Math.min((historicalNoteCount - j) / historicalNoteCount, currHistoricalDecay);

        const currDelta = currObj.strainTime;
        const prevDelta = prevObj.strainTime;
        const lastDelta = lastObj.strainTime;
        const currRatio =
          1.0 +
          6.0 *
            Math.min(
              0.5,
              Math.pow(Math.sin(Math.PI / (Math.min(prevDelta, currDelta) / Math.max(prevDelta, currDelta))), 2),
            );

        let windowPenalty = Math.min(
          1,
          Math.max(0, Math.abs(prevDelta - currDelta) - diffCurrent.hitWindowGreat * 0.3) /
            (diffCurrent.hitWindowGreat * 0.3),
        );

        windowPenalty = Math.min(1, windowPenalty);

        let effectiveRatio = windowPenalty * currRatio;

        if (firstDeltaSwitch) {
          if (!(prevDelta > 1.25 * currDelta || prevDelta * 1.25 < currDelta)) {
            if (islandSize < 7) islandSize++;
          } else {
            if (isSlider(previousHitObject(j - 1))) effectiveRatio *= 0.125;

            if (isSlider(previousHitObject(j))) effectiveRatio *= 0.25;

            if (previousIslandSize == islandSize) effectiveRatio *= 0.25;

            if (previousIslandSize % 2 == islandSize % 2) effectiveRatio *= 0.5;

            if (lastDelta > prevDelta + 10 && prevDelta > currDelta + 10) effectiveRatio *= 0.125;

            rhythmComplexitySum +=
              (((Math.sqrt(effectiveRatio * startRatio) * currHistoricalDecay * Math.sqrt(4 + islandSize)) / 2) *
                Math.sqrt(4 + previousIslandSize)) /
              2;

            startRatio = effectiveRatio;

            previousIslandSize = islandSize;

            if (prevDelta * 1.25 < currDelta) firstDeltaSwitch = false;

            islandSize = 1;
          }
        } else if (prevDelta > 1.25 * currDelta) {
          firstDeltaSwitch = true;
          startRatio = effectiveRatio;
          islandSize = 1;
        }
      }

      return Math.sqrt(4 + rhythmComplexitySum * rhythm_multiplier) / 2;
    })();

    currentStrain *= strainDecay(diffCurrent.strainTime);
    currentStrain += speedEvaluateDifficultyOf * skillMultiplier;
    const totalStrain = currentStrain * currentRhythm;
    strains.push(totalStrain);

    maxStrain = Math.max(maxStrain, totalStrain);
    if (!onlyFinalRelevantCountValue || i + 1 === hitObjects.length) {
      if (maxStrain <= 0 || strains.length == 0) {
        relevantNoteCounts.push(0);
      } else {
        let sum = 0;
        for (let j = 1; j < strains.length; ++j) {
          sum += 1 / (1 + Math.exp(-((strains[j] / maxStrain) * 12.0 - 6.0)));
        }
        relevantNoteCounts.push(sum);
      }
    }
  }
  return { strains, relevantNoteCounts };
}

export function calculateSpeed(hitObjects: OsuHitObject[], diffs: OsuDifficultyHitObject[], onlyFinalValue: boolean) {
  const { strains, relevantNoteCounts } = calculateSpeedInfo(hitObjects, diffs, onlyFinalValue);
  return {
    speedValues: calculateOsuStrainDifficultyValues(
      diffs,
      strains,
      {
        decayWeight: 0.9,
        difficultyMultiplier: 1.04,
        sectionDuration: 400,
        reducedSectionCount: 5,
        strainDecay,
      },
      onlyFinalValue,
    ),
    relevantNoteCounts,
  };
}
