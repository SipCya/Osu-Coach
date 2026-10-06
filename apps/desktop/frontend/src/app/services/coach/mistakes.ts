import {
  Beatmap,
  GameState,
  HitCircle,
  isHitCircle,
  isSlider,
  OsuAction,
  ReplayFrame,
  Slider,
  SliderCheckPoint,
} from "@osujs/core";
import { hitWindowsForOD, Position, Vec2 } from "@osujs/math";
import { Msg, msg, TranslationKey } from "../../i18n";

export type MistakeCategory = "Aim" | "Tapping" | "Notelock" | "Tracking";
export type MistakeKind = "Miss" | "Slider break";

export interface Press {
  time: number;
  key: "L" | "R";
  position: Position;
}

export interface Mistake {
  id: string;
  time: number;
  hitObjectId: string;
  kind: MistakeKind;
  category: MistakeCategory;
  title: Msg;
  lines: Msg[];
  metrics: [Msg, Msg | string][];
  focus?: Position;
  press?: Press;
  ballTime?: number;
}

export const CATEGORY_COLORS: Record<MistakeCategory, string> = {
  Aim: "#ff5c7a",
  Tapping: "#ffb347",
  Notelock: "#b48cff",
  Tracking: "#5cc8ff",
};

const FOLLOW_SCALE = 2.4;
const LATE_LOOKAHEAD = 200;

export class CursorTrack {
  private readonly times: number[];

  constructor(public readonly frames: ReplayFrame[]) {
    this.times = frames.map((f) => f.time);
  }

  indexAt(time: number): number {
    let lo = 0;
    let hi = this.times.length - 1;
    if (hi < 0 || time < this.times[0]) return 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.times[mid] <= time) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  positionAt(time: number): Position {
    const i = this.indexAt(time);
    const a = this.frames[i];
    const b = this.frames[i + 1];
    if (!b || time <= a.time) return a.position;
    const f = (time - a.time) / Math.max(1, b.time - a.time);
    return { x: a.position.x + (b.position.x - a.position.x) * f, y: a.position.y + (b.position.y - a.position.y) * f };
  }

  isPressing(time: number): boolean {
    return this.frames[this.indexAt(time)].actions.length > 0;
  }

  speedAt(time: number, window = 16): number {
    return Vec2.distance(this.positionAt(time - window), this.positionAt(time)) / window;
  }

  between(t0: number, t1: number): ReplayFrame[] {
    const i0 = this.indexAt(t0);
    const i1 = this.indexAt(t1);
    return this.frames.slice(i0, i1 + 1);
  }
}

export function extractPresses(frames: ReplayFrame[]): Press[] {
  const presses: Press[] = [];
  let left = false;
  let right = false;
  for (const f of frames) {
    const l = f.actions.includes(OsuAction.leftButton);
    const r = f.actions.includes(OsuAction.rightButton);
    if (l && !left) presses.push({ time: f.time, key: "L", position: f.position });
    if (r && !right) presses.push({ time: f.time, key: "R", position: f.position });
    left = l;
    right = r;
  }
  return presses;
}

const fmtSigned = (ms: number) => `${ms >= 0 ? "+" : "−"}${Math.abs(Math.round(ms))} ms`;
const label = (key: TranslationKey) => msg(key);

interface Context {
  beatmap: Beatmap;
  state: GameState;
  cursor: CursorTrack;
  presses: Press[];
  windows: { great: number; ok: number; meh: number; miss: number };
  usedPress: Map<number, string>;
}

export interface CoachAnalysis {
  mistakes: Mistake[];
  presses: Press[];
  cursor: CursorTrack;
  windows: Context["windows"];
}

export function analyseMistakes(beatmap: Beatmap, frames: ReplayFrame[], state: GameState): CoachAnalysis {
  const [great, ok, meh, miss] = hitWindowsForOD(beatmap.difficulty.overallDifficulty);
  const cursor = new CursorTrack(frames);
  const presses = extractPresses(frames);
  const usedPress = new Map<number, string>();
  for (const id in state.hitCircleVerdict) {
    const v = state.hitCircleVerdict[id];
    if (v.type !== "MISS") usedPress.set(v.judgementTime, id);
  }
  const ctx: Context = { beatmap, state, cursor, presses, windows: { great, ok, meh, miss }, usedPress };

  const order = beatmap.hitObjects.filter((h) => isHitCircle(h) || isSlider(h)) as (HitCircle | Slider)[];
  const mistakes: Mistake[] = [];

  order.forEach((obj, i) => {
    const previous = i > 0 ? order[i - 1] : undefined;
    const head = isSlider(obj) ? obj.head : obj;
    const verdict = state.hitCircleVerdict[head.id];
    if (verdict && verdict.type === "MISS") {
      mistakes.push(explainMiss(ctx, obj, head, previous, verdict.missReason));
      return;
    }
    if (isSlider(obj)) {
      const broken = obj.checkPoints.find(
        (c) => c.type !== "LAST_LEGACY_TICK" && state.checkPointVerdict[c.id] && !state.checkPointVerdict[c.id].hit,
      );
      if (broken) mistakes.push(explainBreak(ctx, obj, broken));
    }
  });
  mistakes.sort((a, b) => a.time - b.time);
  return { mistakes, presses, cursor, windows: ctx.windows };
}

function aimDetails(obj: HitCircle, previous: HitCircle | Slider | undefined, point: Position) {
  const offset = Vec2.sub(point, obj.position);
  const distance = Math.hypot(offset.x, offset.y);
  const metrics: [Msg, Msg | string][] = [
    [label("metric.distance"), `${distance.toFixed(0)} px`],
    [label("metric.outside"), `${Math.max(0, distance - obj.radius).toFixed(1)} px`],
  ];
  const lines: Msg[] = [];
  if (previous) {
    const start = isSlider(previous) ? previous.endPosition : previous.position;
    const endTime = isSlider(previous) ? previous.endTime : previous.hitTime;
    const jump = Vec2.sub(obj.position, start);
    const jumpLength = Math.hypot(jump.x, jump.y);
    metrics.push([
      label("metric.jump"),
      msg("metric.jumpValue", { px: jumpLength.toFixed(0), ms: Math.round(obj.hitTime - endTime) }),
    ]);
    if (jumpLength > obj.radius * 0.5) {
      const along = (offset.x * jump.x + offset.y * jump.y) / jumpLength;
      const side = (jump.x * offset.y - jump.y * offset.x) / jumpLength;
      if (Math.abs(along) >= Math.abs(side)) {
        lines.push(
          along > 0 ? msg("m.overshoot", { px: along.toFixed(0) }) : msg("m.undershoot", { px: (-along).toFixed(0) }),
        );
      } else {
        lines.push(
          msg("m.lateral", { px: Math.abs(side).toFixed(0), side: side > 0 ? "@m.side.right" : "@m.side.left" }),
        );
      }
    }
  }
  return { lines, metrics };
}

function explainMiss(
  ctx: Context,
  obj: HitCircle | Slider,
  head: HitCircle,
  previous: HitCircle | Slider | undefined,
  missReason: string,
): Mistake {
  const { windows, presses, cursor } = ctx;
  const t = head.hitTime;
  const kind: MistakeKind = isSlider(obj) ? "Slider break" : "Miss";
  const what = isSlider(obj) ? "@m.what.sliderHead" : "@m.what.circle";
  const whatOn = isSlider(obj) ? "@m.on.sliderHead" : "@m.on.circle";
  const meh = windows.meh.toFixed(0);
  const base: [Msg, Msg | string][] = [
    [label("metric.object"), msg("metric.objectValue", { combo: head.withinComboSetIndex + 1 })],
    [label("metric.window50"), `±${meh} ms`],
  ];
  const make = (m: Omit<Mistake, "id" | "time" | "hitObjectId" | "kind">): Mistake => ({
    id: `miss-${head.id}`,
    time: t,
    hitObjectId: obj.id,
    kind,
    ...m,
  });
  const onCircle = (p: Press) => Vec2.distance(p.position, head.position) <= head.radius;
  const near = presses.filter((p) => p.time >= t - windows.miss && p.time <= t + windows.meh + LATE_LOOKAHEAD);

  if (missReason === "HIT_TOO_EARLY") {
    const p = near.filter((q) => onCircle(q) && q.time < t - windows.meh).pop();
    const early = p ? Math.round(t - p.time) : undefined;
    return make({
      category: "Tapping",
      title: label("m.tooEarly.title"),
      lines: [
        early !== undefined ? msg("m.tooEarly.l1", { what, early }) : msg("m.tooEarly.l1NoTime", { what }),
        msg("m.tooEarly.l2", { meh }),
        label("m.tooEarly.l3"),
      ],
      metrics: early !== undefined ? [...base, [label("metric.early"), `${early} ms`]] : base,
      focus: p?.position,
      press: p,
    });
  }

  const stolen = near.find(
    (p) =>
      onCircle(p) &&
      Math.abs(p.time - t) <= windows.meh &&
      ctx.usedPress.has(p.time) &&
      ctx.usedPress.get(p.time) !== head.id,
  );
  if (stolen) {
    const other = ctx.beatmap.getHitCircle(ctx.usedPress.get(stolen.time) as string);
    const stacked = other && Vec2.distance(other.position, head.position) < head.radius;
    return make({
      category: "Tapping",
      title: label("m.missingTap.title"),
      lines: [
        msg("m.missingTap.l1", { whatOn, offset: fmtSigned(stolen.time - t) }),
        label("m.missingTap.l2"),
        label(stacked ? "m.missingTap.l3Stack" : "m.missingTap.l3Stream"),
      ],
      metrics: [...base, [label("metric.click"), fmtSigned(stolen.time - t)]],
      focus: stolen.position,
      press: stolen,
    });
  }

  const blocked = near.find((p) => onCircle(p) && Math.abs(p.time - t) <= windows.meh && !ctx.usedPress.has(p.time));
  if (blocked) {
    return make({
      category: "Notelock",
      title: label("m.notelock.title"),
      lines: [
        msg("m.notelock.l1", { whatOn, offset: fmtSigned(blocked.time - t) }),
        label("m.notelock.l2"),
        label("m.notelock.l3"),
      ],
      metrics: [...base, [label("metric.click"), fmtSigned(blocked.time - t)]],
      focus: blocked.position,
      press: blocked,
    });
  }

  const late = near.find((p) => onCircle(p) && p.time > t + windows.meh);
  if (late) {
    return make({
      category: "Tapping",
      title: label("m.late.title"),
      lines: [
        msg("m.late.l1", { what, late: Math.round(late.time - t) }),
        msg("m.late.l2", { meh }),
        label("m.late.l3"),
      ],
      metrics: [...base, [label("metric.late"), fmtSigned(late.time - t)]],
      focus: late.position,
      press: late,
    });
  }

  const inWindow = near.filter((p) => Math.abs(p.time - t) <= Math.max(windows.meh, 120) && !onCircle(p));
  if (inWindow.length > 0) {
    const p = inWindow.reduce((a, b) => (Math.abs(a.time - t) <= Math.abs(b.time - t) ? a : b));
    const { lines, metrics } = aimDetails(head, previous, p.position);
    const speed = cursor.speedAt(p.time);
    const allLines = [msg("m.aim.l1", { offset: fmtSigned(p.time - t) }), ...lines];
    if (speed > 0.6) allLines.push(msg("m.aim.fast", { speed: speed.toFixed(1) }));
    return make({
      category: "Aim",
      title: label("m.aim.title"),
      lines: allLines,
      metrics: [
        ...base,
        ...metrics,
        [label("metric.click"), fmtSigned(p.time - t)],
        [label("metric.speed"), `${speed.toFixed(2)} px/ms`],
      ],
      focus: p.position,
      press: p,
    });
  }

  let wasInside = false;
  for (let s = t - windows.meh; s <= t + windows.meh; s += 4) {
    if (Vec2.distance(cursor.positionAt(s), head.position) <= head.radius) {
      wasInside = true;
      break;
    }
  }
  const point = cursor.positionAt(t);
  if (wasInside) {
    return make({
      category: "Tapping",
      title: label("m.noClick.title"),
      lines: [msg("m.noClick.l1", { what }), label("m.noClick.l2")],
      metrics: base,
      focus: point,
    });
  }
  const { lines, metrics } = aimDetails(head, previous, point);
  return make({
    category: "Aim",
    title: label("m.skipped.title"),
    lines: [msg("m.skipped.l1", { meh }), ...lines],
    metrics: [...base, ...metrics],
    focus: point,
  });
}

function explainBreak(ctx: Context, slider: Slider, checkPoint: SliderCheckPoint): Mistake {
  const t = checkPoint.hitTime;
  const name = checkPoint.type === "REPEAT" ? "@m.repeat" : "@m.tick";
  const ball = checkPoint.position;
  const point = ctx.cursor.positionAt(t);
  const distance = Vec2.distance(point, ball).toFixed(0);
  const follow = (slider.radius * FOLLOW_SCALE).toFixed(0);
  const metrics: [Msg, Msg | string][] = [
    [label("metric.object"), msg("metric.objectValue", { combo: slider.head.withinComboSetIndex + 1 })],
    [label("metric.moment"), msg("metric.momentValue", { ms: Math.round(t - slider.startTime) })],
    [label("metric.ballDistance"), msg("metric.ballDistanceValue", { distance, follow })],
  ];
  const base = { id: `break-${checkPoint.id}`, time: t, hitObjectId: slider.id, kind: "Slider break" as const };
  if (!ctx.cursor.isPressing(t)) {
    return {
      ...base,
      category: "Tapping",
      title: label("m.released.title"),
      lines: [msg("m.released.l1", { name }), label("m.released.l2")],
      metrics,
      focus: point,
      ballTime: t,
    };
  }
  return {
    ...base,
    category: "Tracking",
    title: label("m.tracking.title"),
    lines: [msg("m.tracking.l1", { name, distance, follow }), label("m.tracking.l2")],
    metrics,
    focus: point,
    ballTime: t,
  };
}
