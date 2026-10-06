import { float32, float32_div, float32_mul } from "./float32";

export type Position = { x: number; y: number };

export class Vec2 {
  x: number;
  y: number;

  static Zero = new Vec2(0, 0);

  constructor(x: number, y: number) {
    this.x = float32(x);
    this.y = float32(y);
  }

  static withinDistance(a: Position, b: Position, d: number): boolean {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= d ** 2;
  }

  static distance(a: Position, b: Position): number {
    return Math.fround(Math.sqrt(Vec2.distanceSquared(a, b)));
  }

  static distanceSquared(a: Position, b: Position): number {
    const dx = a.x - b.x,
      dy = a.y - b.y;
    return dx ** 2 + dy ** 2;
  }

  static equal(a: Position, b: Position): boolean {
    return a.x === b.x && a.y === b.y;
  }

  static add(a: Position, b: Position): Vec2 {
    return new Vec2(float32(a.x) + float32(b.x), float32(a.y) + float32(b.y));
  }

  static dot(a: Position, b: Position): number {
    return Math.fround(a.x * b.x + a.y * b.y);
  }

  static sub(a: Position, b: Position): Vec2 {
    return new Vec2(float32(a.x) - float32(b.x), float32(a.y) - float32(b.y));
  }

  static scale(a: Position, c: number): Vec2 {
    return new Vec2(float32_mul(a.x, c), float32_mul(a.y, c));
  }

  static divide(a: Position, c: number): Vec2 {
    return new Vec2(float32_div(a.x, c), float32_div(a.y, c));
  }

  static interpolate(a: Position, b: Position, p: number): Vec2 {
    return Vec2.add(a, Vec2.sub(b, a).scale(p));
  }

  add(b: Position): Vec2 {
    return Vec2.add(this, b);
  }

  sub(b: Position): Vec2 {
    return Vec2.sub(this, b);
  }

  divide(c: number): Vec2 {
    return Vec2.divide(this, c);
  }

  scale(c: number): Vec2 {
    return Vec2.scale(this, c);
  }

  lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  length(): number {
    return float32(Math.sqrt(this.x ** 2 + this.y ** 2));
  }

  equals(b: Position): boolean {
    return Vec2.equal(this, b);
  }

  normalized(): Vec2 {
    const num = this.length();
    this.x = float32_div(this.x, num);
    this.y = float32_div(this.y, num);
    return this;
  }
}
