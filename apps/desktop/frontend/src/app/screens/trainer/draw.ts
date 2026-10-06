import { AimTarget, LATE_WINDOW_MS } from "../../services/trainer/aim-session";
import { ActiveSlider, FOLLOW_RADIUS_FACTOR, SliderFrame } from "../../services/trainer/slider-session";
import { clamp, Judgement, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, Point } from "../../services/trainer/trainer-math";

export const ACCENT = "#ff66aa";
const JUDGEMENT_COLORS: Record<Judgement, string> = { 300: "#66ccff", 100: "#88dd66", 50: "#ffcc44", 0: "#ff4455" };
const FADE_IN_MS = 200;
const MARKER_MS = 700;

export interface View {
  scale: number;
  offsetX: number;
  offsetY: number;
  dpr: number;
}

export function computeView(cssWidth: number, cssHeight: number, dpr: number): View {
  const margin = 40;
  const scale = Math.max(
    0.1,
    Math.min((cssWidth - margin * 2) / PLAYFIELD_WIDTH, (cssHeight - margin * 2) / PLAYFIELD_HEIGHT),
  );
  return {
    scale,
    offsetX: (cssWidth - PLAYFIELD_WIDTH * scale) / 2,
    offsetY: (cssHeight - PLAYFIELD_HEIGHT * scale) / 2,
    dpr,
  };
}

export function toPlayfield(view: View, cssX: number, cssY: number): Point {
  return { x: (cssX - view.offsetX) / view.scale, y: (cssY - view.offsetY) / view.scale };
}

export interface HitMarker {
  position: Point;
  judgement: Judgement;
  time: number;
}

function applyView(ctx: CanvasRenderingContext2D, view: View) {
  ctx.setTransform(
    view.dpr * view.scale,
    0,
    0,
    view.dpr * view.scale,
    view.dpr * view.offsetX,
    view.dpr * view.offsetY,
  );
}

export function clear(ctx: CanvasRenderingContext2D, view: View) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  applyView(ctx, view);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1 / view.scale;
  ctx.fillRect(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
  ctx.strokeRect(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
}

function circle(ctx: CanvasRenderingContext2D, p: Point, r: number) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(0, r), 0, Math.PI * 2);
}

function hitCircle(ctx: CanvasRenderingContext2D, p: Point, r: number, alpha: number, rings: boolean) {
  ctx.globalAlpha = alpha;
  circle(ctx, p, r);
  ctx.fillStyle = "rgba(255,102,170,0.85)";
  ctx.fill();
  if (rings) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.2;
    circle(ctx, p, r / 3);
    ctx.stroke();
    circle(ctx, p, (r * 2) / 3);
    ctx.stroke();
  }
  ctx.strokeStyle = "white";
  ctx.lineWidth = Math.max(2, r * 0.09);
  circle(ctx, p, r);
  ctx.stroke();
  ctx.fillStyle = "white";
  circle(ctx, p, Math.max(1.5, r * 0.05));
  ctx.fill();
  ctx.globalAlpha = 1;
}

function approachCircle(ctx: CanvasRenderingContext2D, p: Point, r: number, progress: number, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = Math.max(2, r * 0.08);
  circle(ctx, p, r * (1 + 3 * (1 - clamp(progress, 0, 1))));
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawAimTarget(ctx: CanvasRenderingContext2D, target: AimTarget, now: number) {
  const fadeIn = clamp((now - target.spawnTime) / FADE_IN_MS, 0, 1);
  const fadeOut = now > target.hitTime ? 1 - clamp((now - target.hitTime) / LATE_WINDOW_MS, 0, 1) : 1;
  const alpha = fadeIn * fadeOut;

  if (target.from.x !== target.position.x || target.from.y !== target.position.y) {
    ctx.globalAlpha = 0.25 * alpha;
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(target.from.x, target.from.y);
    ctx.lineTo(target.position.x, target.position.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  const progress = (now - target.spawnTime) / (target.hitTime - target.spawnTime);
  hitCircle(ctx, target.position, target.radius, alpha, true);
  if (now < target.hitTime) approachCircle(ctx, target.position, target.radius, progress, alpha);
}

export function drawMarkers(ctx: CanvasRenderingContext2D, markers: HitMarker[], now: number) {
  for (const m of markers) {
    const age = now - m.time;
    if (age > MARKER_MS) continue;
    ctx.globalAlpha = 1 - age / MARKER_MS;
    ctx.strokeStyle = JUDGEMENT_COLORS[m.judgement];
    ctx.lineWidth = 2.5;
    const s = 6;
    ctx.beginPath();
    ctx.moveTo(m.position.x - s, m.position.y - s);
    ctx.lineTo(m.position.x + s, m.position.y + s);
    ctx.moveTo(m.position.x + s, m.position.y - s);
    ctx.lineTo(m.position.x - s, m.position.y + s);
    ctx.stroke();
    ctx.fillStyle = JUDGEMENT_COLORS[m.judgement];
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(m.judgement === 0 ? "✗" : String(m.judgement), m.position.x, m.position.y - 14);
  }
  ctx.globalAlpha = 1;
}

export function drawSlider(
  ctx: CanvasRenderingContext2D,
  slider: ActiveSlider,
  frame: SliderFrame | null,
  now: number,
) {
  const { path, radius } = slider;
  const fadeIn = clamp((now - slider.spawnTime) / FADE_IN_MS, 0, 1);
  const start = path.points[0];
  const end = path.points[path.points.length - 1];

  ctx.globalAlpha = fadeIn;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (const p of path.points) ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = "white";
  ctx.lineWidth = radius * 2;
  ctx.stroke();
  ctx.strokeStyle = "#2a1f2b";
  ctx.lineWidth = radius * 2 - Math.max(4, radius * 0.18);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.globalAlpha = fadeIn;
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = Math.max(2, radius * 0.08);
  circle(ctx, end, radius * 0.95);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (now < slider.startTime) {
    hitCircle(ctx, start, radius, fadeIn, false);
    const progress = (now - slider.spawnTime) / (slider.startTime - slider.spawnTime);
    approachCircle(ctx, start, radius, progress, fadeIn);
    return;
  }
  if (!frame) return;
  circle(ctx, frame.ball, radius * 0.85);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  ctx.strokeStyle = frame.tracking ? "white" : "rgba(255,68,85,0.9)";
  ctx.lineWidth = Math.max(2, radius * 0.08);
  circle(ctx, frame.ball, frame.tracking ? radius * FOLLOW_RADIUS_FACTOR : radius);
  ctx.stroke();
}

export function drawHud(ctx: CanvasRenderingContext2D, view: View, left: string, right: string) {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.font = "bold 18px sans-serif";
  ctx.fillStyle = "white";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(left, 16, 12);
  ctx.textAlign = "right";
  ctx.fillText(right, ctx.canvas.width / view.dpr - 16, 12);
  ctx.textBaseline = "alphabetic";
  applyView(ctx, view);
}

export function drawCountdown(ctx: CanvasRenderingContext2D, view: View, text: string) {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.font = "bold 96px sans-serif";
  ctx.fillStyle = ACCENT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, ctx.canvas.width / view.dpr / 2, ctx.canvas.height / view.dpr / 2);
  ctx.textBaseline = "alphabetic";
  applyView(ctx, view);
}
