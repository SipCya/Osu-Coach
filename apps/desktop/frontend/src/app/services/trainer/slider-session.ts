import {
  arToPreempt,
  csToRadius,
  distance,
  insidePlayfield,
  nextPosition,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
  Point,
  Random,
} from "./trainer-math";

export type SliderShape = "linear" | "curve" | "wave" | "mixed";

export interface SliderSettings {
  cs: number;
  ar: number;
  velocity: number;
  length: number;
  shape: SliderShape;
  jumpDistance: number;
  durationSec: number;
}

export const DEFAULT_SLIDER_SETTINGS: SliderSettings = {
  cs: 4,
  ar: 7,
  velocity: 250,
  length: 220,
  shape: "mixed",
  jumpDistance: 150,
  durationSec: 60,
};

export const FOLLOW_RADIUS_FACTOR = 2.4;

export interface SliderPath {
  points: Point[];
  lengths: number[];
  length: number;
}

export function buildPath(points: Point[]): SliderPath {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  return { points, lengths, length: lengths[lengths.length - 1] };
}

export function pointAt(path: SliderPath, d: number): Point {
  const { points, lengths } = path;
  if (d <= 0) return points[0];
  if (d >= path.length) return points[points.length - 1];
  let lo = 0;
  let hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] <= d) lo = mid;
    else hi = mid;
  }
  const t = (d - lengths[lo]) / (lengths[hi] - lengths[lo] || 1);
  return { x: points[lo].x + (points[hi].x - points[lo].x) * t, y: points[lo].y + (points[hi].y - points[lo].y) * t };
}

function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, steps: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

function rawShape(shape: Exclude<SliderShape, "mixed">, start: Point, angle: number, length: number, random: Random) {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -dir.y, y: dir.x };
  const at = (along: number, side: number) => ({
    x: start.x + dir.x * along + normal.x * side,
    y: start.y + dir.y * along + normal.y * side,
  });
  if (shape === "linear") return [start, at(length, 0)];
  if (shape === "curve") {
    const sweep = (Math.PI / 3 + (random() * (Math.PI * 2)) / 3) * (random() < 0.5 ? -1 : 1);
    const radius = length / Math.abs(sweep);
    const center = at(0, radius * Math.sign(sweep));
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const steps = 48;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const a = startAngle - (sweep * i) / steps;
      return { x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius };
    });
  }
  const amplitude = length * (0.25 + random() * 0.2);
  const end = at(length * 0.8, 0);
  return cubicBezier(start, at(length * 0.3, amplitude), at(length * 0.5, -amplitude), end, 64);
}

function withLength(points: Point[], length: number): SliderPath {
  const full = buildPath(points);
  if (full.length >= length) {
    const out: Point[] = [points[0]];
    for (let i = 1; i < points.length && full.lengths[i] < length; i++) out.push(points[i]);
    out.push(pointAt(full, length));
    return buildPath(out);
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2] ?? points[0];
  const seg = distance(prev, last) || 1;
  const extra = length - full.length;
  return buildPath([
    ...points,
    { x: last.x + ((last.x - prev.x) / seg) * extra, y: last.y + ((last.y - prev.y) / seg) * extra },
  ]);
}

export function generateSliderPath(
  shape: SliderShape,
  start: Point,
  length: number,
  margin: number,
  random: Random = Math.random,
): SliderPath {
  const kinds: Exclude<SliderShape, "mixed">[] = ["linear", "curve", "wave"];
  let currentLength = length;
  for (let round = 0; round < 6; round++) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const kind = shape === "mixed" ? kinds[Math.floor(random() * kinds.length)] : shape;
      const path = withLength(rawShape(kind, start, random() * Math.PI * 2, currentLength, random), currentLength);
      if (path.points.every((p) => insidePlayfield(p, margin))) return path;
    }
    currentLength *= 0.75;
  }
  return buildPath([start, start]);
}

export interface ActiveSlider {
  id: number;
  path: SliderPath;
  radius: number;
  spawnTime: number;
  startTime: number;
  endTime: number;
}

export interface SliderResult {
  slider: ActiveSlider;
  tracked: number;
  averageDistance: number;
}

export interface SliderFrame {
  ball: Point;
  tracking: boolean;
}

export class SliderSession {
  readonly results: SliderResult[] = [];
  slider: ActiveSlider | null = null;
  private nextId = 1;
  private readonly preempt: number;
  readonly radius: number;
  private sampledMs = 0;
  private trackedMs = 0;
  private distanceSum = 0;
  private lastSample: number | null = null;
  private following = false;

  constructor(
    readonly settings: SliderSettings,
    readonly startTime: number,
    private readonly random: Random = Math.random,
  ) {
    this.preempt = arToPreempt(settings.ar);
    this.radius = csToRadius(settings.cs);
    this.spawn(startTime, { x: PLAYFIELD_WIDTH / 2 - 100, y: PLAYFIELD_HEIGHT / 2 });
  }

  get endTime() {
    return this.startTime + this.settings.durationSec * 1000;
  }

  isFinished(now: number) {
    return now >= this.endTime && this.slider === null;
  }

  private spawn(now: number, start: Point) {
    const path = generateSliderPath(this.settings.shape, start, this.settings.length, this.radius, this.random);
    const startTime = now + this.preempt;
    this.slider = {
      id: this.nextId++,
      path,
      radius: this.radius,
      spawnTime: now,
      startTime,
      endTime: startTime + (path.length / Math.max(1, this.settings.velocity)) * 1000,
    };
    this.sampledMs = 0;
    this.trackedMs = 0;
    this.distanceSum = 0;
    this.lastSample = null;
    this.following = false;
  }

  update(now: number, cursor: Point, held: boolean): SliderFrame | null {
    const slider = this.slider;
    if (!slider) return null;
    if (now < slider.startTime) return null;

    const t = Math.min(now, slider.endTime);
    const progress = (t - slider.startTime) / (slider.endTime - slider.startTime || 1);
    const ball = pointAt(slider.path, progress * slider.path.length);
    const dist = distance(cursor, ball);
    const limit = this.following ? slider.radius * FOLLOW_RADIUS_FACTOR : slider.radius;
    this.following = held && dist <= limit;

    if (this.lastSample !== null) {
      const dt = t - this.lastSample;
      this.sampledMs += dt;
      if (this.following) this.trackedMs += dt;
      this.distanceSum += (dist / slider.radius) * dt;
    }
    this.lastSample = t;

    if (now >= slider.endTime) {
      this.results.push({
        slider,
        tracked: this.sampledMs > 0 ? this.trackedMs / this.sampledMs : 0,
        averageDistance: this.sampledMs > 0 ? this.distanceSum / this.sampledMs : 0,
      });
      const end = slider.path.points[slider.path.points.length - 1];
      if (now < this.endTime) {
        const next = nextPosition(
          end,
          this.settings.jumpDistance * 0.8,
          this.settings.jumpDistance,
          this.radius,
          this.random,
        );
        this.spawn(now, next);
      } else {
        this.slider = null;
      }
    }
    return { ball, tracking: this.following };
  }
}
