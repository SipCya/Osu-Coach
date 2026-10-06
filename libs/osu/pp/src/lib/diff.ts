import {
  Beatmap,
  determineDefaultPlaybackSpeed,
  HitCircle,
  isHitCircle,
  isSlider,
  isSpinner,
  mostCommonBeatLength,
  OsuClassicMod,
  OsuHitObject,
  Slider,
} from "@osujs/core";
import {
  approachDurationToApproachRate,
  approachRateToApproachDuration,
  beatLengthToBPM,
  float32,
  float32_add,
  float32_div,
  float32_mul,
  hitWindowGreatToOD,
  overallDifficultyToHitWindowGreat,
  Position,
  Vec2,
} from "@osujs/math";
import { calculateAim } from "./skills/aim";
import { calculateSpeed } from "./skills/speed";
import { calculateFlashlight } from "./skills/flashlight";

export interface OsuDifficultyHitObject {
  deltaTime: number;
  startTime: number;
  endTime: number;

  strainTime: number;
  lazyJumpDistance: number;
  minimumJumpTime: number;
  minimumJumpDistance: number;
  travelDistance: number;
  travelTime: number;
  angle: number | null;
  hitWindowGreat: number;

  lazyTravelTime: number;
  lazyTravelDistance: number;
  lazyEndPosition: Position;
}

const startTime = (o: OsuHitObject) => (isHitCircle(o) ? o.hitTime : o.startTime);
const endTime = (o: OsuHitObject) => (isHitCircle(o) ? o.hitTime : o.endTime);
const position = (o: HitCircle | Slider) => (isHitCircle(o) ? o.position : o.head.position);

const NORMALISED_RADIUS = 50.0;
const maximum_slider_radius = NORMALISED_RADIUS * 2.4;
const assumed_slider_radius = NORMALISED_RADIUS * 1.8;

function computeSliderCursorPosition(slider: Slider) {
  const lazyTravelTime = slider.checkPoints[slider.checkPoints.length - 1].hitTime - slider.startTime;
  let lazyTravelDistance = 0;

  let endTimeMin = lazyTravelTime / slider.spanDuration;
  if (endTimeMin % 2 >= 1) endTimeMin = 1 - (endTimeMin % 1);
  else endTimeMin %= 1;
  let lazyEndPosition = Vec2.add(slider.startPosition, slider.path.positionAt(endTimeMin)) as Position;
  let currCursorPosition = slider.startPosition;
  const scalingFactor = NORMALISED_RADIUS / slider.radius;

  const numCheckPoints = slider.checkPoints.length;
  for (let i = 0; i < numCheckPoints; i++) {
    const currMovementObj = slider.checkPoints[i];

    const currMovementObjPosition =
      currMovementObj.type === "LAST_LEGACY_TICK" ? slider.endPosition : currMovementObj.position;

    let currMovement = Vec2.sub(currMovementObjPosition, currCursorPosition);
    let currMovementLength = scalingFactor * currMovement.length();

    let requiredMovement = assumed_slider_radius;

    if (i === numCheckPoints - 1) {
      const lazyMovement = Vec2.sub(lazyEndPosition, currCursorPosition);

      if (lazyMovement.length() < currMovement.length()) currMovement = lazyMovement;

      currMovementLength = scalingFactor * currMovement.length();
    } else if (currMovementObj.type === "REPEAT") {
      requiredMovement = NORMALISED_RADIUS;
    }

    if (currMovementLength > requiredMovement) {
      currCursorPosition = Vec2.add(
        currCursorPosition,
        Vec2.scale(currMovement, float32_div(currMovementLength - requiredMovement, currMovementLength)),
      );
      currMovementLength *= (currMovementLength - requiredMovement) / currMovementLength;
      lazyTravelDistance = float32_add(lazyTravelDistance, currMovementLength);
    }

    if (i === numCheckPoints - 1) lazyEndPosition = currCursorPosition;
  }

  return { lazyTravelTime, lazyTravelDistance, lazyEndPosition };
}

const defaultOsuDifficultyHitObject = (): OsuDifficultyHitObject => ({
  hitWindowGreat: 0,
  deltaTime: 0,
  travelTime: 0,
  travelDistance: 0,
  minimumJumpDistance: 0,
  minimumJumpTime: 0,
  lazyJumpDistance: 0,
  strainTime: 0,
  endTime: 0,
  startTime: 0,
  angle: null,
  lazyTravelDistance: 0,
  lazyEndPosition: Vec2.Zero,
  lazyTravelTime: 0,
});

function preprocessDifficultyHitObject(
  hitObjects: OsuHitObject[],
  { clockRate, overallDifficulty }: { clockRate: number; overallDifficulty: number },
): OsuDifficultyHitObject[] {
  const difficultyHitObjects: OsuDifficultyHitObject[] = [defaultOsuDifficultyHitObject()];
  const min_delta_time = 25;

  const clockAdjusted = (x: number) => x / clockRate;
  const hitWindowGreat = clockAdjusted(2 * overallDifficultyToHitWindowGreat(overallDifficulty));
  const sliderCursorPosition: Record<string, ReturnType<typeof computeSliderCursorPosition>> = {};

  function computeSliderCursorPositionIfNeeded(s: Slider): ReturnType<typeof computeSliderCursorPosition> {
    if (sliderCursorPosition[s.id] === undefined) {
      sliderCursorPosition[s.id] = computeSliderCursorPosition(s);
    }
    return sliderCursorPosition[s.id];
  }

  for (let i = 1; i < hitObjects.length; i++) {
    const lastLast: OsuHitObject | undefined = hitObjects[i - 2];
    const last = hitObjects[i - 1];
    const current = hitObjects[i];

    const difficultyHitObject = (function calculateDifficultyHitObject() {
      let result = defaultOsuDifficultyHitObject();
      result.startTime = clockAdjusted(startTime(current));
      result.endTime = clockAdjusted(endTime(current));
      result.deltaTime = clockAdjusted(startTime(current) - startTime(last));

      const strainTime = Math.max(result.deltaTime, min_delta_time);
      result.strainTime = strainTime;
      result.hitWindowGreat = hitWindowGreat;

      if (isSlider(current)) {
        result = { ...result, ...computeSliderCursorPosition(current) };
        result.travelDistance = result.lazyTravelDistance * Math.pow(1 + current.repeatCount / 2.5, 1.0 / 2.5);
        result.travelTime = Math.max(result.lazyTravelTime / clockRate, min_delta_time);
      }
      if (isSpinner(current) || isSpinner(last)) return result;

      let scalingFactor = float32_div(NORMALISED_RADIUS, current.radius);

      if (current.radius < 30) {
        const smallCircleBonus = float32_div(Math.min(30 - current.radius, 5), 50);
        scalingFactor *= 1 + smallCircleBonus;
      }

      function getEndCursorPosition(o: HitCircle | Slider) {
        if (isHitCircle(o)) return o.position;
        const { lazyEndPosition } = computeSliderCursorPositionIfNeeded(o);
        return lazyEndPosition ?? o.startPosition;
      }

      const lastCursorPosition = getEndCursorPosition(last);
      result.lazyJumpDistance = Vec2.distance(
        Vec2.scale(position(current), scalingFactor),
        Vec2.scale(lastCursorPosition, scalingFactor),
      );
      result.minimumJumpTime = strainTime;
      result.minimumJumpDistance = result.lazyJumpDistance;

      if (isSlider(last)) {
        const { lazyTravelTime: lastSliderLazyTravelTime } = computeSliderCursorPositionIfNeeded(last);
        const lastTravelTime = Math.max(clockAdjusted(lastSliderLazyTravelTime), min_delta_time);
        result.minimumJumpTime = Math.max(strainTime - lastTravelTime, min_delta_time);
        const tailJumpDistance = float32(Vec2.distance(last.endPosition, position(current)) * scalingFactor);
        result.minimumJumpDistance = Math.max(
          0,
          Math.min(
            result.lazyJumpDistance - (maximum_slider_radius - assumed_slider_radius),
            tailJumpDistance - maximum_slider_radius,
          ),
        );
      }

      if (lastLast !== undefined && !isSpinner(lastLast)) {
        const lastLastCursorPosition = getEndCursorPosition(lastLast);
        const v1 = Vec2.sub(lastLastCursorPosition, position(last));
        const v2 = Vec2.sub(position(current), lastCursorPosition);
        const dot = float32(Vec2.dot(v1, v2));
        const det = float32_add(float32_mul(v1.x, v2.y), -float32_mul(v1.y, v2.x));
        result.angle = Math.abs(Math.atan2(det, dot));
      }

      return result;
    })();

    difficultyHitObjects.push(difficultyHitObject);
  }
  return difficultyHitObjects;
}

export interface DifficultyAttributes {
  aimDifficulty: number;
  speedDifficulty: number;
  speedNoteCount: number;
  flashlightDifficulty: number;
  sliderFactor: number;

  starRating: number;

  maxCombo: number;
  hitCircleCount: number;
  sliderCount: number;
  spinnerCount: number;
  mostCommonBPM: number;

  approachRate: number;
  overallDifficulty: number;
  drainRate: number;
}

function determineMaxCombo(hitObjects: OsuHitObject[]) {
  let maxCombo = 0;
  let hitCircleCount = 0,
    sliderCount = 0,
    spinnerCount = 0;

  for (const o of hitObjects) {
    maxCombo++;
    if (isHitCircle(o)) hitCircleCount++;
    if (isSpinner(o)) spinnerCount++;
    if (isSlider(o)) {
      sliderCount++;
      maxCombo += o.checkPoints.length;
    }
  }
  return { maxCombo, hitCircleCount, sliderCount, spinnerCount };
}

export const PERFORMANCE_BASE_MULTIPLIER = 1.14;
const DIFFICULTY_MULTIPLIER = 0.0675;

const speedAdjustedAR = (AR: number, clockRate: number) =>
  approachDurationToApproachRate(approachRateToApproachDuration(AR) / clockRate);
const speedAdjustedOD = (OD: number, clockRate: number) =>
  hitWindowGreatToOD(overallDifficultyToHitWindowGreat(OD) / clockRate);

export function calculateDifficultyAttributes(
  { appliedMods: mods, difficulty, hitObjects, controlPointInfo }: Beatmap,
  onlyFinalValue: boolean,
) {
  const clockRate = determineDefaultPlaybackSpeed(mods);
  const diffs = preprocessDifficultyHitObject(hitObjects, {
    clockRate,
    overallDifficulty: difficulty.overallDifficulty,
  });

  const hasHiddenMod = mods.includes("HIDDEN");

  const aimValues = calculateAim(hitObjects, diffs, true, onlyFinalValue);
  const aimValuesNoSliders = calculateAim(hitObjects, diffs, false, onlyFinalValue);
  const { speedValues, relevantNoteCounts } = calculateSpeed(hitObjects, diffs, onlyFinalValue);
  const flashlightValues = calculateFlashlight(
    hitObjects,
    diffs,
    {
      hasHiddenMod,
      approachRate: difficulty.approachRate,
    },
    onlyFinalValue,
  );

  const { hitCircleCount, sliderCount, spinnerCount, maxCombo } = determineMaxCombo(hitObjects);
  const overallDifficulty = speedAdjustedOD(difficulty.overallDifficulty, clockRate);
  const approachRate = speedAdjustedAR(difficulty.approachRate, clockRate);
  const beatLength = mostCommonBeatLength({ hitObjects, timingPoints: controlPointInfo.timingPoints.list });
  const mostCommonBPM = (beatLength === undefined ? 0 : beatLengthToBPM(beatLength)) * clockRate;

  const attributes: DifficultyAttributes[] = [];
  for (let i = 0; i < aimValues.length; i++) {
    let aimRating = Math.sqrt(aimValues[i]) * DIFFICULTY_MULTIPLIER;
    const aimRatingNoSliders = Math.sqrt(aimValuesNoSliders[i]) * DIFFICULTY_MULTIPLIER;
    let speedRating = Math.sqrt(speedValues[i]) * DIFFICULTY_MULTIPLIER;
    const speedNotes = relevantNoteCounts[i];
    let flashlightRating = Math.sqrt(flashlightValues[i]) * DIFFICULTY_MULTIPLIER;

    const sliderFactor = aimRating > 0 ? aimRatingNoSliders / aimRating : 1;

    if (mods.includes("TOUCH_DEVICE" as OsuClassicMod)) {
      aimRating = Math.pow(aimRating, 0.8);
      flashlightRating = Math.pow(flashlightRating, 0.8);
    }

    if (mods.includes("RELAX")) {
      aimRating *= 0.9;
      speedRating = 0;
      flashlightRating *= 0.7;
    }
    const baseAimPerformance = Math.pow(5 * Math.max(1, aimRating / 0.0675) - 4, 3) / 100000;
    const baseSpeedPerformance = Math.pow(5 * Math.max(1, speedRating / 0.0675) - 4, 3) / 100000;
    let baseFlashlightPerformance = 0.0;

    if (mods.includes("FLASH_LIGHT")) baseFlashlightPerformance = Math.pow(flashlightRating, 2.0) * 25.0;

    const basePerformance = Math.pow(
      Math.pow(baseAimPerformance, 1.1) +
        Math.pow(baseSpeedPerformance, 1.1) +
        Math.pow(baseFlashlightPerformance, 1.1),
      1.0 / 1.1,
    );

    const starRating =
      basePerformance > 0.00001
        ? Math.cbrt(PERFORMANCE_BASE_MULTIPLIER) *
          0.027 *
          (Math.cbrt((100000 / Math.pow(2, 1 / 1.1)) * basePerformance) + 4)
        : 0;

    attributes.push({
      aimDifficulty: aimRating,
      speedDifficulty: speedRating,
      speedNoteCount: speedNotes,
      flashlightDifficulty: flashlightRating,
      sliderFactor,
      starRating,
      hitCircleCount,
      sliderCount,
      spinnerCount,
      maxCombo,
      overallDifficulty,
      approachRate,
      mostCommonBPM,
      drainRate: difficulty.drainRate,
    });
  }
  return attributes;
}
