import { useEffect, useRef } from "react";
import { Box, Button, Chip, Dialog, Stack, Typography } from "@mui/material";
import { Beatmap, HitCircle, isHitCircle, isSlider, Slider } from "@osujs/core";
import { Position, Vec2 } from "@osujs/math";
import { CATEGORY_COLORS, CoachAnalysis, Mistake } from "../../services/coach/mistakes";
import { formatTime } from "./MistakesPanel";
import { TranslationKey, TranslationParams, useTranslation } from "../../i18n";

type Tr = (key: TranslationKey, params?: TranslationParams) => string;

const FIELD = "#17171f";
const TEXT = "#ecebf2";
const MUTED = "#8d8c99";
const CURSOR = "#ffe08a";
const KEY_COLORS = { L: "#ff66aa", R: "#7ac7ff" };
const RESULT_COLORS = { great: "#7ac7ff", ok: "#9df07a", meh: "#ffb347" };

const PATH_BEFORE = 650;
const PATH_AFTER = 220;
const FOLLOW_SCALE = 2.4;

interface Props {
  mistake: Mistake;
  analysis: CoachAnalysis;
  beatmap: Beatmap;
  onClose: () => void;
  onReview: (m: Mistake) => void;
}

type Main = HitCircle | Slider;

function headOf(o: Main): HitCircle {
  return isSlider(o) ? o.head : o;
}

function drawZoom(canvas: HTMLCanvasElement, { mistake: m, analysis, beatmap }: Props, color: string, tr: Tr) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = FIELD;
  ctx.fillRect(0, 0, w, h);

  const target = beatmap.getHitObject(m.hitObjectId) as Main;
  const targetHead = headOf(target);
  const objects = (beatmap.hitObjects.filter((o) => isHitCircle(o) || isSlider(o)) as Main[]).filter(
    (o) => headOf(o).hitTime >= targetHead.hitTime - 1200 && headOf(o).hitTime <= targetHead.hitTime + 900,
  );
  const index = objects.indexOf(target);
  const frames = analysis.cursor.between(m.time - PATH_BEFORE, m.time + PATH_AFTER);
  const presses = analysis.presses.filter((p) => p.time >= m.time - PATH_BEFORE && p.time <= m.time + PATH_AFTER);
  const r = targetHead.radius;

  const sliderPoints = (s: Slider): Position[] => s.path.calculatedPath.map((p) => Vec2.add(s.head.position, p));

  const xs: number[] = [];
  const ys: number[] = [];
  objects.forEach((o, i) => {
    if (Math.abs(i - index) > 1) return;
    const p = headOf(o).position;
    xs.push(p.x - r, p.x + r);
    ys.push(p.y - r, p.y + r);
    if (o === target && isSlider(o)) {
      sliderPoints(o).forEach((q) => {
        xs.push(q.x);
        ys.push(q.y);
      });
    }
  });
  frames.forEach((f) => {
    xs.push(f.position.x);
    ys.push(f.position.y);
  });
  const pad = r * 0.6;
  const x0 = Math.min(...xs) - pad;
  const x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad;
  const y1 = Math.max(...ys) + pad;
  const scale = Math.min(w / Math.max(1, x1 - x0), h / Math.max(1, y1 - y0), 4);
  const ox = (w - (x1 - x0) * scale) / 2 - x0 * scale;
  const oy = (h - (y1 - y0) * scale) / 2 - y0 * scale;
  const P = (p: Position) => [ox + p.x * scale, oy + p.y * scale] as const;
  const R = r * scale;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  [...objects].reverse().forEach((o) => {
    const main = o === target;
    const c = main ? color : MUTED;
    if (isSlider(o)) {
      const pts = sliderPoints(o);
      ctx.beginPath();
      pts.forEach((q, i) => (i === 0 ? ctx.moveTo(...P(q)) : ctx.lineTo(...P(q))));
      ctx.strokeStyle = c;
      ctx.globalAlpha = main ? 0.2 : 0.08;
      ctx.lineWidth = 2 * R;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const head = headOf(o);
    const [x, y] = P(head.position);
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.globalAlpha = main ? 0.22 : 0.06;
    ctx.fill();
    ctx.globalAlpha = main ? 1 : 0.5;
    ctx.lineWidth = main ? 3 : 1.5;
    ctx.strokeStyle = c;
    ctx.stroke();
    ctx.fillStyle = TEXT;
    ctx.font = `bold ${Math.max(10, Math.round(R * 0.5))}px Segoe UI, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(head.withinComboSetIndex + 1), x, y);
    ctx.globalAlpha = 1;
  });

  if (m.ballTime !== undefined && isSlider(target)) {
    const progress = (m.ballTime - target.startTime) / Math.max(1, target.endTime - target.startTime);
    const [bx, by] = P(target.ballPositionAt(Math.max(0, Math.min(1, progress))));
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(bx, by, R * FOLLOW_SCALE, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(bx, by, R * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    const age = Math.max(0, Math.min(1, (m.time - b.time) / PATH_BEFORE));
    ctx.globalAlpha = b.time <= m.time ? 0.25 + 0.75 * (1 - age) : 0.35;
    ctx.beginPath();
    ctx.moveTo(...P(a.position));
    ctx.lineTo(...P(b.position));
    ctx.strokeStyle = CURSOR;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.globalAlpha = 0.6;
  frames.forEach((f) => {
    const [x, y] = P(f.position);
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = CURSOR;
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  const placed: [number, number][] = [];
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  presses.forEach((p) => {
    const [x, y] = P(p.position);
    const relevant = Math.abs(p.time - targetHead.hitTime) <= analysis.windows.meh + 80 || p === m.press;
    const size = relevant ? 7 : 4;
    ctx.globalAlpha = relevant ? 1 : 0.45;
    ctx.strokeStyle = KEY_COLORS[p.key];
    ctx.lineWidth = relevant ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x - size, y + size);
    ctx.lineTo(x + size, y - size);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (relevant) {
      let ly = y - 11;
      while (placed.some(([px, py]) => Math.abs(ly - py) < 15 && Math.abs(x - px) < 120)) ly += 15;
      placed.push([x, ly]);
      const offset = Math.round(p.time - targetHead.hitTime);
      ctx.fillStyle = KEY_COLORS[p.key];
      ctx.font = "bold 12px Segoe UI, sans-serif";
      ctx.fillText(
        `${tr(p.key === "L" ? "dialog.left" : "dialog.right")} ${offset >= 0 ? "+" : ""}${offset} ms`,
        x + 11,
        ly,
      );
    }
  });

  if (m.focus) {
    const [x, y] = P(m.focus);
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = TEXT;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.fillStyle = MUTED;
  ctx.font = "11px Segoe UI, sans-serif";
  ctx.fillText(tr("dialog.legend", { before: PATH_BEFORE, after: PATH_AFTER }), 10, h - 10);
}

function drawTiming(canvas: HTMLCanvasElement, { mistake: m, analysis, beatmap }: Props, tr: Tr) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = FIELD;
  ctx.fillRect(0, 0, w, h);

  const { great, ok, meh } = analysis.windows;
  const t0 = headOf(beatmap.getHitObject(m.hitObjectId) as Main).hitTime;
  const presses = analysis.presses.filter((p) => Math.abs(p.time - t0) <= 400);
  const reach = Math.max(meh + 40, ...presses.map((p) => Math.abs(p.time - t0) + 30));
  const left = 20;
  const right = w - 20;
  const mid = 32;
  const X = (offset: number) => left + ((offset + reach) / (2 * reach)) * (right - left);

  (
    [
      [meh, RESULT_COLORS.meh],
      [ok, RESULT_COLORS.ok],
      [great, RESULT_COLORS.great],
    ] as const
  ).forEach(([win, c]) => {
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(X(-win), mid - 9, X(win) - X(-win), 18);
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = TEXT;
  ctx.fillRect(X(0) - 1, mid - 16, 2, 32);
  ctx.fillStyle = MUTED;
  ctx.font = "11px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(tr("dialog.perfectTime"), X(0), mid + 30);
  ctx.fillText(`−${meh.toFixed(0)}`, X(-meh), mid - 18);
  ctx.fillText(`+${meh.toFixed(0)}`, X(meh), mid - 18);
  presses.forEach((p) => {
    const x = X(p.time - t0);
    ctx.fillStyle = KEY_COLORS[p.key];
    ctx.beginPath();
    ctx.moveTo(x - 6, mid - 16);
    ctx.lineTo(x + 6, mid - 16);
    ctx.lineTo(x, mid - 6);
    ctx.fill();
    ctx.fillRect(x - 1, mid - 6, 2, 16);
  });
  if (presses.length === 0) {
    ctx.fillStyle = MUTED;
    ctx.fillText(tr("dialog.noClicks"), w / 2, h - 6);
  }
}

export function MistakeAnalysisDialog(props: Props) {
  const { mistake: m, onClose, onReview } = props;
  const color = CATEGORY_COLORS[m.category];
  const { t, tMsg } = useTranslation();
  const zoomRef = useRef<HTMLCanvasElement | null>(null);
  const timingRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (zoomRef.current) drawZoom(zoomRef.current, props, color, t);
      if (timingRef.current) drawTiming(timingRef.current, props, t);
    });
    return () => cancelAnimationFrame(id);
  }, [props, color, t]);

  return (
    <Dialog open onClose={onClose} maxWidth={"lg"} fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <Stack direction={"row"} gap={2} sx={{ p: 2, height: 620 }}>
        <Stack sx={{ flex: 3, minWidth: 0 }} gap={1}>
          <Typography sx={{ fontWeight: 700 }}>{t("dialog.whatHappened")}</Typography>
          <Box component={"canvas"} ref={zoomRef} sx={{ flex: 1, width: "100%", borderRadius: 2 }} />
          <Typography sx={{ fontWeight: 700, mt: 1 }}>{t("dialog.clickTiming")}</Typography>
          <Box component={"canvas"} ref={timingRef} sx={{ height: 80, width: "100%", borderRadius: 2 }} />
        </Stack>

        <Stack sx={{ flex: 2, minWidth: 0 }} gap={1.5}>
          <Box>
            <Chip
              label={m.category.toUpperCase()}
              size={"small"}
              sx={{ backgroundColor: color, color: "#15151b", fontWeight: 700 }}
            />
          </Box>
          <Typography variant={"h5"} sx={{ fontWeight: 700 }}>
            {tMsg(m.title)}
          </Typography>
          <Typography variant={"body2"} color={"text.secondary"} sx={{ mt: -1 }}>
            {t("dialog.at", { kind: m.kind, time: formatTime(m.time) })}
          </Typography>

          <Stack gap={1}>
            {m.lines.map((line, i) => (
              <Stack key={i} direction={"row"} gap={1}>
                <Box sx={{ color, fontWeight: 700 }}>•</Box>
                <Typography variant={"body2"}>{tMsg(line)}</Typography>
              </Stack>
            ))}
          </Stack>

          <Box sx={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 2, p: 1.5 }}>
            {m.metrics.map(([key, value]) => (
              <Stack key={key.key} direction={"row"} justifyContent={"space-between"} sx={{ py: 0.4 }}>
                <Typography variant={"caption"} color={"text.secondary"}>
                  {tMsg(key)}
                </Typography>
                <Typography variant={"caption"} sx={{ fontWeight: 700 }}>
                  {typeof value === "string" ? value : tMsg(value)}
                </Typography>
              </Stack>
            ))}
          </Box>

          <Box sx={{ flex: 1 }} />
          <Stack direction={"row"} gap={1}>
            <Button
              variant={"contained"}
              fullWidth
              onClick={() => onReview(m)}
              sx={{ backgroundColor: "#ff66aa", fontWeight: 700, "&:hover": { backgroundColor: "#e0558f" } }}
            >
              {t("dialog.review")}
            </Button>
            <Button variant={"outlined"} onClick={onClose}>
              {t("common.close")}
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Dialog>
  );
}
