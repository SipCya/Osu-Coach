import { hitWindowsForOD, Position, Vec2 } from "@osujs/math";
import { Beatmap } from "../beatmap/Beatmap";
import { defaultGameState, GameState, HitCircleVerdict, NOT_PRESSING, PressingSinceTimings } from "./GameState";
import { isHitCircle, isSlider, isSpinner } from "../hitobjects/Types";
import { Slider } from "../hitobjects/Slider";
import { OsuAction, ReplayFrame } from "../replays/Replay";
import { MainHitObjectVerdict } from "./Verdicts";
import { HitCircle } from "../hitobjects/HitCircle";
import { RELAX_LENIENCY } from "../mods/Mods";

type Event = {
  time: number;
  hitObjectId: string;
  type:
    | "HIT_CIRCLE_SPAWN"
    | "HIT_CIRCLE_FORCE_KILL"
    | "SLIDER_START"
    | "SLIDER_END"
    | "SPINNER_START"
    | "SPINNER_END"
    | "SLIDER_CHECK_POINT";
};

function generateEvents(beatmap: Beatmap, hitWindows: number[]): Event[] {
  const events: Event[] = [];
  const mehHitWindow = hitWindows[2];

  const pushHitCircleEvents = (h: HitCircle) => {
    events.push({ time: h.hitTime - h.approachDuration, hitObjectId: h.id, type: "HIT_CIRCLE_SPAWN" });
    events.push({ time: h.hitTime + mehHitWindow + 1, hitObjectId: h.id, type: "HIT_CIRCLE_FORCE_KILL" });
  };

  for (const h of beatmap.hitObjects) {
    if (isHitCircle(h)) {
      pushHitCircleEvents(h);
    } else if (isSlider(h)) {
      pushHitCircleEvents(h.head);
      events.push({ time: h.startTime, hitObjectId: h.id, type: "SLIDER_START" });
      events.push({ time: h.endTime, hitObjectId: h.id, type: "SLIDER_END" });
      h.checkPoints.forEach((c) => {
        events.push({ time: c.hitTime, hitObjectId: c.id, type: "SLIDER_CHECK_POINT" });
      });
    } else if (isSpinner(h)) {
      events.push({ time: h.startTime, hitObjectId: h.id, type: "SPINNER_START" });
      events.push({ time: h.endTime, hitObjectId: h.id, type: "SPINNER_END" });
    }
  }

  events.sort((a, b) => a.time - b.time);

  return events;
}

export type NoteLockStyle = "NONE" | "STABLE" | "LAZER";
export type HitWindowStyle = "OSU_STABLE" | "OSU_LAZER";

export type GameStateEvaluatorOptions = {
  hitWindowStyle: HitWindowStyle;
  noteLockStyle: NoteLockStyle;
};

const defaultOptions: GameStateEvaluatorOptions = {
  noteLockStyle: "STABLE",
  hitWindowStyle: "OSU_STABLE",
};

const HitObjectVerdicts = {
  GREAT: 0,
  OK: 1,
  MEH: 2,
  MISS: 3,
} as const;

function isWithinHitWindow(hitWindow: number[], delta: number, verdict: MainHitObjectVerdict): boolean {
  return Math.abs(delta) <= hitWindow[HitObjectVerdicts[verdict]];
}

export class GameStateEvaluator {
  private readonly events: Event[];
  private gameState: GameState = defaultGameState();
  private frame: ReplayFrame = { time: 0, position: { x: 0, y: 0 }, actions: [] };
  private options: GameStateEvaluatorOptions;
  private hitWindows: number[];

  constructor(private readonly beatmap: Beatmap, options?: GameStateEvaluatorOptions) {
    this.options = Object.assign({ ...defaultOptions }, options);
    this.hitWindows = hitWindowsForOD(
      beatmap.difficulty.overallDifficulty,
      this.options.hitWindowStyle === "OSU_LAZER",
    );
    this.events = generateEvents(beatmap, this.hitWindows);
  }

  judgeHitCircle(id: string, verdict: HitCircleVerdict) {
    this.gameState.hitCircleVerdict[id] = verdict;
    this.gameState.aliveHitCircleIds.delete(id);
    this.gameState.judgedObjects.push(id);
  }

  handleHitCircleSpawn(time: number, hitCircleId: string) {
    this.gameState.aliveHitCircleIds.add(hitCircleId);
  }

  handleHitCircleForceKill(time: number, hitCircleId: string) {
    if (!this.gameState.aliveHitCircleIds.has(hitCircleId)) {
      return;
    }
    const verdict: HitCircleVerdict = { judgementTime: time, type: "MISS", missReason: "TIME_EXPIRED" };
    this.judgeHitCircle(hitCircleId, verdict);
  }

  handleSliderStart(time: number, sliderId: string) {
    this.gameState.aliveSliderIds.add(sliderId);
  }

  handleSliderEnding(time: number, sliderId: string) {
    const slider = this.beatmap.getSlider(sliderId);

    const headVerdict = this.gameState.hitCircleVerdict[slider.head.id];
    if (headVerdict === undefined) {
      this.judgeHitCircle(slider.head.id, {
        judgementTime: slider.endTime,
        type: "MISS",
        missReason: "SLIDER_FINISHED_FASTER",
      });
    }

    const totalCheckpoints = slider.checkPoints.length + 1;
    let hitCheckpoints = 0;
    if (!(headVerdict === undefined || headVerdict.type === "MISS")) hitCheckpoints++;
    for (const c of slider.checkPoints) {
      hitCheckpoints += this.gameState.checkPointVerdict[c.id]?.hit ? 1 : 0;
    }
    this.gameState.sliderVerdict[slider.id] = sliderVerdictBasedOnCheckpoints(totalCheckpoints, hitCheckpoints);
    this.gameState.judgedObjects.push(slider.id);

    this.gameState.aliveSliderIds.delete(sliderId);
    this.gameState.sliderBodyState.delete(sliderId);
  }

  predictedCursorPositionAt(time: number): Position {
    const previousTime = this.gameState.currentTime;
    const nextTime = this.frame.time;
    const previousPosition = this.gameState.cursorPosition;
    const nextPosition = this.frame.position;

    if (previousTime === nextTime) return previousPosition;

    const f = (time - previousTime) / (nextTime - previousTime);
    return Vec2.interpolate(previousPosition, nextPosition, f);
  }

  handleSliderCheckPoint(time: number, id: string) {
    const cursorPosition = this.predictedCursorPositionAt(time);
    const checkPoint = this.beatmap.getSliderCheckPoint(id);
    this.updateSliderBodyTracking(time, cursorPosition, this.gameState.pressingSince);
    const sliderId = checkPoint.slider.id;
    const state = this.gameState.sliderBodyState.get(sliderId);
    if (state === undefined) {
      throw Error("Somehow the slider body has no state while there is a checkpoint alive.");
    }
    this.gameState.checkPointVerdict[id] = { hit: state.isTracking };
    this.gameState.judgedObjects.push(id);
  }

  handleSpinnerStart(id: string) {
    this.gameState.aliveSpinnerIds.add(id);
  }

  handleSpinnerEnd(id: string) {
    this.gameState.aliveSpinnerIds.delete(id);
    this.gameState.judgedObjects.push(id);
  }

  handleEvent(event: Event) {
    const { hitObjectId, time, type } = event;
    switch (type) {
      case "HIT_CIRCLE_SPAWN":
        this.handleHitCircleSpawn(time, hitObjectId);
        break;
      case "HIT_CIRCLE_FORCE_KILL":
        this.handleHitCircleForceKill(time, hitObjectId);
        break;
      case "SLIDER_START":
        this.handleSliderStart(time, hitObjectId);
        break;
      case "SLIDER_END":
        this.handleSliderEnding(time, hitObjectId);
        break;
      case "SLIDER_CHECK_POINT":
        this.handleSliderCheckPoint(time, hitObjectId);
        break;
      case "SPINNER_START":
        this.handleSpinnerStart(hitObjectId);
        break;
      case "SPINNER_END":
        this.handleSpinnerEnd(hitObjectId);
        break;
    }
  }

  handleAliveHitCircles() {
    const hasRelax = this.beatmap.appliedMods.includes("RELAX");
    if (!this.hasFreshClickThisFrame && !hasRelax) {
      return;
    }
    const { noteLockStyle } = this.options;
    const currentTime = this.gameState.currentTime;
    let noteLocked = false;

    const hitCircleIds = Array.from(this.gameState.aliveHitCircleIds.values());

    for (let i = 0; i < hitCircleIds.length; i++) {
      const id = hitCircleIds[i];
      const hitCircle = this.beatmap.getHitCircle(id);
      const cursorInside = Vec2.withinDistance(
        hitCircle.position,
        this.gameState.cursorPosition,
        Math.fround(hitCircle.radius),
      );

      if (!cursorInside) {
        if (noteLockStyle === "STABLE") {
          noteLocked = true;
        }
        if (noteLockStyle === "LAZER" && currentTime <= hitCircle.hitTime) {
          noteLocked = true;
        }
        continue;
      }

      if (noteLocked) {
        break;
      }

      const delta = currentTime - hitCircle.hitTime;
      if (hasRelax && delta < -RELAX_LENIENCY) break;

      let judged = false;
      for (const verdict of ["GREAT", "OK", "MEH"] as const) {
        if (isWithinHitWindow(this.hitWindows, delta, verdict)) {
          this.judgeHitCircle(hitCircle.id, { judgementTime: currentTime, type: verdict });
          judged = true;
          break;
        }
      }

      if (judged) break;

      if (isWithinHitWindow(this.hitWindows, delta, "MISS")) {
        this.judgeHitCircle(hitCircle.id, { judgementTime: currentTime, type: "MISS", missReason: "HIT_TOO_EARLY" });
        judged = true;
      }

      if (judged) break;
    }
  }

  private get hasFreshClickThisFrame(): boolean {
    return this.gameState.pressingSince.includes(this.gameState.currentTime);
  }

  private headHitTime(headId: string): number | undefined {
    const verdict = this.gameState.hitCircleVerdict[headId];
    if (!verdict || verdict.type === "MISS") return undefined;
    return verdict.judgementTime;
  }

  private updateSliderBodyTracking(time: number, cursorPosition: Position, pressingSince: PressingSinceTimings): void {
    for (const id of this.gameState.aliveSliderIds) {
      const slider = this.beatmap.getSlider(id);

      const headHitTime: number | undefined = this.headHitTime(slider.head.id);
      const wasTracking: boolean = this.gameState.sliderBodyState.get(id)?.isTracking ?? false;
      const hasRelax = this.beatmap.appliedMods.includes("RELAX");
      const isTracking = determineTracking(
        wasTracking,
        slider,
        cursorPosition,
        time,
        pressingSince,
        headHitTime,
        hasRelax,
      );
      this.gameState.sliderBodyState.set(id, { isTracking });
    }
  }

  handleEventsUntilTime(maxTimeInclusive: number) {
    const { gameState, events } = this;
    while (gameState.eventIndex < events.length) {
      const event = events[gameState.eventIndex];
      if (event.time > maxTimeInclusive) {
        break;
      }
      gameState.eventIndex += 1;
      this.handleEvent(event);
    }
  }

  evaluate(gameState: GameState, frame: ReplayFrame) {
    this.gameState = gameState;
    this.frame = frame;

    this.handleEventsUntilTime(frame.time - 1);

    this.gameState.cursorPosition = frame.position;
    this.gameState.currentTime = frame.time;
    this.gameState.pressingSince = newPressingSince(this.gameState.pressingSince, frame.actions, frame.time);
    this.gameState.clickWasUseful = false;

    this.handleAliveHitCircles();
    this.updateSliderBodyTracking(frame.time, frame.position, this.gameState.pressingSince);

    this.handleEventsUntilTime(frame.time);
  }
}

const sliderProgress = (slider: Slider, time: number) => (time - slider.startTime) / slider.duration;

function determineTracking(
  previouslyTracking: boolean,
  slider: Slider,
  cursorPosition: Position,
  time: number,
  pressingSince: PressingSinceTimings,
  headHitTime?: number,
  hasRelax?: boolean,
): boolean {
  const keyIsBeingPressed = pressingSince.findIndex((x) => x !== NOT_PRESSING) >= 0;
  if (!keyIsBeingPressed && !hasRelax) return false;

  if (time < slider.startTime || slider.endTime <= time) return false;

  const progress = sliderProgress(slider, time);
  const followCircleRadius = (previouslyTracking ? 2.4 : 1.0) * slider.radius;
  const distanceCursorToBall = Vec2.distance(slider.ballPositionAt(progress), cursorPosition);
  if (distanceCursorToBall > followCircleRadius) return false;

  if (headHitTime === undefined) return true;
  return pressingSince.findIndex((x) => x >= headHitTime) >= 0;
}

function sliderVerdictBasedOnCheckpoints(totalCheckpoints: number, hitCheckpoints: number): MainHitObjectVerdict {
  if (hitCheckpoints === totalCheckpoints) return "GREAT";
  if (hitCheckpoints === 0) return "MISS";
  if (hitCheckpoints * 2 >= totalCheckpoints) return "OK";
  return "MEH";
}

const actionsToBooleans = (osuActions: OsuAction[]) => [
  osuActions.includes(OsuAction.leftButton),
  osuActions.includes(OsuAction.rightButton),
];

export const newPressingSince = (pressingSince: PressingSinceTimings, osuActions: OsuAction[], time: number) => {
  const pressed = actionsToBooleans(osuActions);
  const newPressingSince = [...pressingSince];
  for (let i = 0; i < newPressingSince.length; i++) {
    if (pressed[i]) {
      newPressingSince[i] = Math.min(newPressingSince[i], time);
    } else {
      newPressingSince[i] = NOT_PRESSING;
    }
  }
  return newPressingSince;
};
