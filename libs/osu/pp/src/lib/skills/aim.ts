import { isSlider, isSpinner, OsuHitObject } from "@osujs/core";
import { clamp } from "@osujs/math";
import { OsuDifficultyHitObject } from "../diff";
import { calculateOsuStrainDifficultyValues } from "./strain";

const wide_angle_multiplier = 1.5;
const acute_angle_multiplier = 1.95;
const slider_multiplier = 1.35;
const velocity_change_multiplier = 0.75;

const skillMultiplier = 23.55;

const strainDecayBase = 0.15;
const strainDecay = (ms: number) => Math.pow(strainDecayBase, ms / 1000);

const calcWideAngleBonus = (angle: number) =>
  Math.pow(Math.sin((3.0 / 4) * (Math.min((5.0 / 6) * Math.PI, Math.max(Math.PI / 6, angle)) - Math.PI / 6)), 2);
const calcAcuteAngleBonus = (angle: number) => 1 - calcWideAngleBonus(angle);

function calculateAimStrains(
  hitObjects: OsuHitObject[],
  diffs: OsuDifficultyHitObject[],
  withSliders: boolean,
): number[] {
  if (hitObjects.length === 0) return [];

  const strains: number[] = [0];
  let currentStrain = 0;

  for (let i = 1; i < diffs.length; i++) {
    const lastLast = hitObjects[i - 2];
    const last = hitObjects[i - 1];
    const current = hitObjects[i];

    const diffLastLast = diffs[i - 2];
    const diffLast = diffs[i - 1];
    const diffCurrent = diffs[i];

    const strainValueOf = (function () {
      if (i <= 2 || isSpinner(current) || isSpinner(last)) return 0;

      let currVelocity = diffCurrent.lazyJumpDistance / diffCurrent.strainTime;

      if (isSlider(last) && withSliders) {
        const travelVelocity = diffLast.travelDistance / diffLast.travelTime;
        const movementVelocity = diffCurrent.minimumJumpDistance / diffCurrent.minimumJumpTime;
        currVelocity = Math.max(currVelocity, movementVelocity + travelVelocity);
      }

      let prevVelocity = diffLast.lazyJumpDistance / diffLast.strainTime;
      if (isSlider(lastLast) && withSliders) {
        const travelVelocity = diffLastLast.travelDistance / diffLastLast.travelTime;
        const movementVelocity = diffLast.minimumJumpDistance / diffLast.minimumJumpTime;
        prevVelocity = Math.max(prevVelocity, movementVelocity + travelVelocity);
      }
      let wideAngleBonus = 0;
      let acuteAngleBonus = 0;
      let sliderBonus = 0;
      let velocityChangeBonus = 0;

      let aimStrain = currVelocity;

      if (
        Math.max(diffCurrent.strainTime, diffLast.strainTime) <
        1.25 * Math.min(diffCurrent.strainTime, diffLast.strainTime)
      ) {
        if (diffCurrent.angle !== null && diffLast.angle !== null && diffLastLast.angle !== null) {
          const currAngle = diffCurrent.angle;
          const lastAngle = diffLast.angle;
          const lastLastAngle = diffLastLast.angle;

          const angleBonus = Math.min(currVelocity, prevVelocity);

          wideAngleBonus = calcWideAngleBonus(currAngle);
          acuteAngleBonus = calcAcuteAngleBonus(currAngle);

          if (diffCurrent.strainTime > 100) acuteAngleBonus = 0;
          else {
            acuteAngleBonus *=
              calcAcuteAngleBonus(lastAngle) *
              Math.min(angleBonus, 125 / diffCurrent.strainTime) *
              Math.pow(Math.sin((Math.PI / 2) * Math.min(1, (100 - diffCurrent.strainTime) / 25)), 2) *
              Math.pow(Math.sin(((Math.PI / 2) * (clamp(diffCurrent.lazyJumpDistance, 50, 100) - 50)) / 50), 2);
          }

          wideAngleBonus *= angleBonus * (1 - Math.min(wideAngleBonus, Math.pow(calcWideAngleBonus(lastAngle), 3)));
          acuteAngleBonus *=
            0.5 + 0.5 * (1 - Math.min(acuteAngleBonus, Math.pow(calcAcuteAngleBonus(lastLastAngle), 3)));
        }
      }

      if (Math.max(prevVelocity, currVelocity) !== 0) {
        prevVelocity = (diffLast.lazyJumpDistance + diffLastLast.travelDistance) / diffLast.strainTime;
        currVelocity = (diffCurrent.lazyJumpDistance + diffLast.travelDistance) / diffCurrent.strainTime;

        const distRatio = Math.pow(
          Math.sin(((Math.PI / 2) * Math.abs(prevVelocity - currVelocity)) / Math.max(prevVelocity, currVelocity)),
          2,
        );

        const overlapVelocityBuff = Math.min(
          125 / Math.min(diffCurrent.strainTime, diffLast.strainTime),
          Math.abs(prevVelocity - currVelocity),
        );

        velocityChangeBonus = overlapVelocityBuff * distRatio;

        velocityChangeBonus *= Math.pow(
          Math.min(diffCurrent.strainTime, diffLast.strainTime) / Math.max(diffCurrent.strainTime, diffLast.strainTime),
          2,
        );
      }

      if (isSlider(last)) {
        sliderBonus = diffLast.travelDistance / diffLast.travelTime;
      }

      aimStrain += Math.max(
        acuteAngleBonus * acute_angle_multiplier,
        wideAngleBonus * wide_angle_multiplier + velocityChangeBonus * velocity_change_multiplier,
      );

      if (withSliders) aimStrain += sliderBonus * slider_multiplier;

      return aimStrain;
    })();

    currentStrain *= strainDecay(diffCurrent.deltaTime);
    currentStrain += strainValueOf * skillMultiplier;
    strains.push(currentStrain);
  }
  return strains;
}

export function calculateAim(
  hitObjects: OsuHitObject[],
  diffs: OsuDifficultyHitObject[],
  withSliders: boolean,
  onlyFinalValue: boolean,
) {
  const strains = calculateAimStrains(hitObjects, diffs, withSliders);
  return calculateOsuStrainDifficultyValues(
    diffs,
    strains,
    {
      decayWeight: 0.9,
      difficultyMultiplier: 1.06,
      sectionDuration: 400,
      reducedSectionCount: 10,
      strainDecay,
    },
    onlyFinalValue,
  );
}
