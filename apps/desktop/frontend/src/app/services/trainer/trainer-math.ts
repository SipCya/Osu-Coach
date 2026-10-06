export const PLAYFIELD_WIDTH = 512;
export const PLAYFIELD_HEIGHT = 384;

export interface Point {
  x: number;
  y: number;
}

export type Random = () => number;

export function csToRadius(cs: number): number {
  return 54.4 - 4.48 * cs;
}

export function arToPreempt(ar: number): number {
  return ar < 5 ? 1200 + (600 * (5 - ar)) / 5 : 1200 - (750 * (ar - 5)) / 5;
}

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export type Judgement = 300 | 100 | 50 | 0;

export function judgeByDistance(dist: number, radius: number): Judgement {
  const ratio = dist / radius;
  if (ratio <= 1 / 3) return 300;
  if (ratio <= 2 / 3) return 100;
  if (ratio <= 1) return 50;
  return 0;
}

export function accuracy(judgements: Judgement[]): number {
  if (judgements.length === 0) return 1;
  return judgements.reduce<number>((sum, j) => sum + j, 0) / (300 * judgements.length);
}

export function offsetInJumpFrame(from: Point, target: Point, click: Point, radius: number) {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const len = Math.hypot(dx, dy);
  const ox = click.x - target.x;
  const oy = click.y - target.y;
  if (len < 1e-6) return { along: 0, across: 0 };
  const ux = dx / len;
  const uy = dy / len;
  return { along: (ox * ux + oy * uy) / radius, across: (ox * -uy + oy * ux) / radius };
}

export function insidePlayfield(p: Point, margin: number) {
  return p.x >= margin && p.x <= PLAYFIELD_WIDTH - margin && p.y >= margin && p.y <= PLAYFIELD_HEIGHT - margin;
}

export function nextPosition(
  from: Point,
  minDistance: number,
  maxDistance: number,
  margin: number,
  random: Random = Math.random,
): Point {
  let min = Math.min(minDistance, maxDistance);
  let max = Math.max(minDistance, maxDistance);
  for (let round = 0; round < 8; round++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const angle = random() * Math.PI * 2;
      const dist = min + random() * (max - min);
      const p = { x: from.x + Math.cos(angle) * dist, y: from.y + Math.sin(angle) * dist };
      if (insidePlayfield(p, margin)) return p;
    }
    min *= 0.75;
    max *= 0.75;
  }
  return { x: PLAYFIELD_WIDTH / 2, y: PLAYFIELD_HEIGHT / 2 };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}
