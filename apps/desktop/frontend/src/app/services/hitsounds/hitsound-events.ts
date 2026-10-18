import {
  HitsoundData,
  SampleRequest,
  samplesForHit,
  samplesForSliderBody,
  samplesForSpinner,
  samplesForTick,
} from "./hitsound-data";

export interface HitsoundEvent {
  time: number;
  samples: SampleRequest[];
}

/** A sound that loops for a whole span (slider slide / spinner spin) — export mixdown only. */
export interface ContinuousEvent {
  startMs: number;
  endMs: number;
  samples: SampleRequest[];
}

export interface HitObjectLike {
  type: string;
  id?: string;
  hitTime?: number;
  startTime?: number;
  head?: { id: string; hitTime: number };
  checkPoints?: { id: string; type: string; hitTime: number }[];
  repeatCount?: number;
  endTime?: number;
}

export interface VerdictState {
  hitCircleVerdict: Record<string, { type: string; judgementTime: number }>;
  checkPointVerdict: Record<string, { hit: boolean }>;
}

export function buildHitsoundEvents(
  hitObjects: HitObjectLike[],
  state: VerdictState,
  data: HitsoundData,
): HitsoundEvent[] {
  const events: HitsoundEvent[] = [];
  hitObjects.forEach((object, index) => {
    if (object.type === "HIT_CIRCLE" && object.id !== undefined) {
      const verdict = state.hitCircleVerdict[object.id];
      if (verdict && verdict.type !== "MISS") {
        events.push({ time: verdict.judgementTime, samples: samplesForHit(data, index, 0, object.hitTime ?? 0) });
      }
      return;
    }
    if (object.type !== "SLIDER" || !object.head) return;
    const head = state.hitCircleVerdict[object.head.id];
    if (head && head.type !== "MISS") {
      events.push({ time: head.judgementTime, samples: samplesForHit(data, index, 0, object.head.hitTime) });
    }
    const endTime = object.endTime ?? object.head.hitTime;
    let repeat = 0;
    for (const checkPoint of object.checkPoints ?? []) {
      if (checkPoint.type === "REPEAT") repeat++;
      if (!state.checkPointVerdict[checkPoint.id]?.hit) continue;
      if (checkPoint.type === "TICK") {
        events.push({ time: checkPoint.hitTime, samples: samplesForTick(data, index, checkPoint.hitTime) });
      } else if (checkPoint.type === "REPEAT") {
        events.push({ time: checkPoint.hitTime, samples: samplesForHit(data, index, repeat, checkPoint.hitTime) });
      } else {
        const node = (object.repeatCount ?? 0) + 1;
        events.push({ time: endTime, samples: samplesForHit(data, index, node, endTime) });
      }
    }
  });
  return events.sort((a, b) => a.time - b.time);
}

/**
 * Looping sounds that play for the whole duration of an object: slider slides (while the head
 * was hit, not missed) and spinner spins. These are mixed into the exported video's audio only.
 */
export function buildContinuousEvents(
  hitObjects: HitObjectLike[],
  state: VerdictState,
  data: HitsoundData,
): ContinuousEvent[] {
  const events: ContinuousEvent[] = [];
  hitObjects.forEach((object, index) => {
    if (object.type === "SLIDER" && object.head) {
      const head = state.hitCircleVerdict[object.head.id];
      if (!head || head.type === "MISS") return;
      const endMs = object.endTime ?? object.head.hitTime;
      if (endMs <= head.judgementTime) return;
      const samples = samplesForSliderBody(data, index, object.head.hitTime);
      if (samples.length > 0) events.push({ startMs: head.judgementTime, endMs, samples });
    } else if (object.type === "SPINNER") {
      const startMs = object.startTime ?? object.hitTime;
      const endMs = object.endTime;
      if (startMs == null || endMs == null || endMs <= startMs) return;
      events.push({ startMs, endMs, samples: samplesForSpinner(data, index, startMs) });
    }
  });
  return events;
}
