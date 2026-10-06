import {
  arToPreempt,
  clamp,
  csToRadius,
  distance,
  Judgement,
  judgeByDistance,
  nextPosition,
  offsetInJumpFrame,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
  Point,
  Random,
} from "./trainer-math";

export interface AimSettings {
  cs: number;
  ar: number;
  minDistance: number;
  maxDistance: number;
  sizeVariation: number;
  durationSec: number;
  waitForClick: boolean;
  bpm: number;
  divisor: number;
}

export const DEFAULT_AIM_SETTINGS: AimSettings = {
  cs: 4,
  ar: 7,
  minDistance: 180,
  maxDistance: 320,
  sizeVariation: 0.3,
  durationSec: 60,
  waitForClick: true,
  bpm: 100,
  divisor: 1,
};

export function beatInterval(settings: Pick<AimSettings, "bpm" | "divisor">): number {
  return 60000 / Math.max(1, settings.bpm) / Math.max(1, settings.divisor);
}

export interface AimTarget {
  id: number;
  position: Point;
  from: Point;
  radius: number;
  spawnTime: number;
  hitTime: number;
}

export interface AimResult {
  target: AimTarget;
  judgement: Judgement;
  click?: Point;
  time: number;
  reactionMs: number;
  timingMs?: number;
  distanceRatio?: number;
  along?: number;
  across?: number;
}

export const LATE_WINDOW_MS = 250;

const CENTER: Point = { x: PLAYFIELD_WIDTH / 2, y: PLAYFIELD_HEIGHT / 2 };

export class AimSession {
  readonly results: AimResult[] = [];
  readonly targets: AimTarget[] = [];
  private nextId = 1;
  private readonly preempt: number;
  private readonly baseRadius: number;
  private readonly interval: number;
  private lastPosition: Point | null = null;
  private nextHitTime: number;

  constructor(
    readonly settings: AimSettings,
    readonly startTime: number,
    private readonly random: Random = Math.random,
  ) {
    this.preempt = arToPreempt(settings.ar);
    this.baseRadius = csToRadius(settings.cs);
    this.interval = beatInterval(settings);
    this.nextHitTime = startTime + this.preempt;
    if (settings.waitForClick) this.spawnNextBeat(startTime);
    else this.scheduleUntil(startTime);
  }

  get endTime() {
    return this.startTime + this.settings.durationSec * 1000;
  }

  get target(): AimTarget | null {
    return this.targets[0] ?? null;
  }

  isFinished(now: number) {
    return now >= this.endTime;
  }

  private spawn(spawnTime: number, hitTime: number) {
    const variation = clamp(this.settings.sizeVariation, 0, 0.6);
    const radius = this.baseRadius * (1 + (this.random() * 2 - 1) * variation);
    const from = this.lastPosition ?? CENTER;
    const position = this.lastPosition
      ? nextPosition(from, this.settings.minDistance, this.settings.maxDistance, radius, this.random)
      : CENTER;
    this.lastPosition = position;
    this.targets.push({ id: this.nextId++, position, from, radius, spawnTime, hitTime });
  }

  private spawnNextBeat(now: number) {
    let hitTime = this.nextHitTime;
    if (hitTime < now + this.interval / 2) hitTime = now + this.interval;
    this.spawn(Math.max(now, hitTime - this.preempt), hitTime);
    this.nextHitTime = hitTime + this.interval;
  }

  private scheduleUntil(now: number) {
    while (this.nextHitTime - this.preempt <= now && this.nextHitTime <= this.endTime) {
      this.spawn(this.nextHitTime - this.preempt, this.nextHitTime);
      this.nextHitTime += this.interval;
    }
  }

  private next(now: number) {
    if (this.settings.waitForClick && this.targets.length === 0) this.spawnNextBeat(now);
  }

  update(now: number) {
    if (this.isFinished(now)) return;
    if (!this.settings.waitForClick) this.scheduleUntil(now);
    while (this.targets.length > 0 && now > this.targets[0].hitTime + LATE_WINDOW_MS) {
      const target = this.targets.shift() as AimTarget;
      this.results.push({ target, judgement: 0, time: now, reactionMs: now - target.spawnTime });
      this.next(now);
    }
  }

  press(now: number, click: Point): AimResult | null {
    const target = this.target;
    if (!target || this.isFinished(now)) return null;
    if (now < target.spawnTime) return null;
    if (!this.settings.waitForClick && now < target.hitTime - LATE_WINDOW_MS) return null;

    const dist = distance(click, target.position);
    const judgement = judgeByDistance(dist, target.radius);
    const result: AimResult = {
      target,
      judgement,
      click,
      time: now,
      reactionMs: now - target.spawnTime,
      timingMs: now - target.hitTime,
    };
    if (judgement > 0) {
      result.distanceRatio = dist / target.radius;
      Object.assign(result, offsetInJumpFrame(target.from, target.position, click, target.radius));
    }
    this.targets.shift();
    this.results.push(result);
    this.next(now);
    return result;
  }
}
