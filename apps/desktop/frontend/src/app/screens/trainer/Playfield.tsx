import { useEffect, useRef } from "react";
import { Box } from "@mui/material";
import { useTranslation } from "../../i18n";
import { AimResult, AimSession, AimSettings } from "../../services/trainer/aim-session";
import { SliderFrame, SliderResult, SliderSession, SliderSettings } from "../../services/trainer/slider-session";
import { accuracy, Point } from "../../services/trainer/trainer-math";
import {
  clear,
  computeView,
  drawAimTarget,
  drawCountdown,
  drawHud,
  drawMarkers,
  drawSlider,
  HitMarker,
  toPlayfield,
  View,
} from "./draw";

const COUNTDOWN_MS = 3000;
export const DEFAULT_KEYS = ["KeyZ", "KeyX"];

export function keyLabel(code: string) {
  return code
    .replace(/^Key/, "")
    .replace(/^Digit/, "")
    .replace(/^Numpad/, "Num ");
}

export type TrainerRun = ({ mode: "aim"; settings: AimSettings } | { mode: "slider"; settings: SliderSettings }) & {
  keys: string[];
};

export type TrainerOutcome = { mode: "aim"; results: AimResult[] } | { mode: "slider"; results: SliderResult[] };

const formatTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function Playfield({
  run,
  onFinish,
  onCancel,
}: {
  run: TrainerRun;
  onFinish: (outcome: TrainerOutcome) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onFinish, onCancel, t });
  callbacks.current = { onFinish, onCancel, t };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !container || !ctx) return;

    let view: View = computeView(1, 1, 1);
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = container.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      view = computeView(width, height, dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const startAt = performance.now() + COUNTDOWN_MS;
    const aim = run.mode === "aim" ? new AimSession(run.settings, startAt) : null;
    const slider = run.mode === "slider" ? new SliderSession(run.settings, startAt) : null;
    let cursor: Point = { x: 256, y: 192 };
    const bound = new Set(run.keys);
    const keysHeld = new Set<string>();
    let buttonsHeld = 0;
    const markers: HitMarker[] = [];
    let lastFrame: SliderFrame | null = null;
    let finished = false;
    let raf = 0;

    const press = () => {
      const now = performance.now();
      if (!aim || now < startAt) return;
      const result = aim.press(now, cursor);
      if (result) markers.push({ position: cursor, judgement: result.judgement, time: now });
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      cursor = toPlayfield(view, e.clientX - rect.left, e.clientY - rect.top);
    };
    const onPointerDown = (e: PointerEvent) => {
      onPointerMove(e);
      buttonsHeld = e.buttons;
      press();
    };
    const onPointerUp = (e: PointerEvent) => {
      buttonsHeld = e.buttons;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        callbacks.current.onCancel();
        return;
      }
      const key = e.code;
      if (!bound.has(key)) return;
      e.preventDefault();
      if (e.repeat || keysHeld.has(key)) return;
      keysHeld.add(key);
      press();
    };
    const onKeyUp = (e: KeyboardEvent) => keysHeld.delete(e.code);
    const noMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("contextmenu", noMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const { t } = callbacks.current;
      clear(ctx, view);

      if (now < startAt) {
        drawCountdown(ctx, view, String(Math.ceil((startAt - now) / 1000)));
        return;
      }

      if (aim) {
        aim.update(now);
        if (!aim.isFinished(now)) {
          for (let i = aim.targets.length - 1; i >= 0; i--) drawAimTarget(ctx, aim.targets[i], now);
        }
        drawMarkers(ctx, markers, now);
        const judgements = aim.results.map((r) => r.judgement);
        drawHud(
          ctx,
          view,
          formatTime(aim.endTime - now),
          `${(accuracy(judgements) * 100).toFixed(2)}% · ${t("tr.hud.targets", { count: judgements.length })}`,
        );
        if (aim.isFinished(now) && !finished) {
          finished = true;
          callbacks.current.onFinish({ mode: "aim", results: aim.results });
        }
      }

      if (slider) {
        const held = keysHeld.size > 0 || buttonsHeld !== 0;
        const current = slider.slider;
        const result = slider.update(now, cursor, held);
        if (result) lastFrame = result;
        if (current && current !== slider.slider) lastFrame = null;
        if (slider.slider) drawSlider(ctx, slider.slider, lastFrame, now);
        const tracked = slider.results.map((r) => r.tracked);
        const average = tracked.length ? tracked.reduce((a, b) => a + b, 0) / tracked.length : 1;
        drawHud(
          ctx,
          view,
          formatTime(slider.endTime - now),
          `${(average * 100).toFixed(1)}% · ${t("tr.hud.sliders", { count: tracked.length })}`,
        );
        if (slider.isFinished(now) && !finished) {
          finished = true;
          callbacks.current.onFinish({ mode: "slider", results: slider.results });
        }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [run]);

  return (
    <Box ref={containerRef} sx={{ position: "absolute", inset: 0, backgroundColor: "#121016", overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ display: "block", cursor: "crosshair", touchAction: "none" }} />
    </Box>
  );
}
