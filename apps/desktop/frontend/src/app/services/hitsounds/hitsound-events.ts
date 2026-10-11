import { HitsoundData, SampleRequest, samplesForHit, samplesForTick } from "./hitsound-data";

export interface HitsoundEvent {
  time: number;
  samples: SampleRequest[];
}

export interface HitObjectLike {
  type: string;
  id?: string;
  hitTime?: number;
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
