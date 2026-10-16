import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { CoachAnalysis, HitTiming } from "../../services/coach/mistakes";
import { useTranslation } from "../../i18n";

export const JUDGEMENT_COLOR: Record<number, string> = { 300: "#7bd88f", 100: "#ffd24a", 50: "#ff9f45" };
const CHART_HEIGHT = 150;

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box sx={{ flex: 1, bgcolor: "rgba(255,255,255,0.04)", borderRadius: 2, p: 1, textAlign: "center", minWidth: 0 }}>
      <Typography sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", fontSize: "1.15rem" }} noWrap>
        {value}
      </Typography>
      <Typography variant={"caption"} color={"text.secondary"} noWrap component={"div"}>
        {label}
      </Typography>
      {sub && (
        <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block" }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

/** Scatter of signed hit errors over time; click a point to jump there. */
function HitErrorChart({
  hits,
  mehMs,
  meanMs,
  onSeek,
}: {
  hits: HitTiming[];
  mehMs: number;
  meanMs: number;
  onSeek: (ms: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(300);

  const bound = Math.max(mehMs, 10);
  const tMax = hits.length ? hits[hits.length - 1].time : 1;
  const tMin = hits.length ? hits[0].time : 0;
  const span = Math.max(1, tMax - tMin);

  const xOf = useCallback((time: number) => ((time - tMin) / span) * width, [tMin, span, width]);
  const yOf = useCallback((err: number) => CHART_HEIGHT / 2 - (err / bound) * (CHART_HEIGHT / 2 - 6), [bound]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setWidth(Math.max(150, Math.floor(e[0].contentRect.width))));
    ro.observe(el);
    setWidth(Math.max(150, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = CHART_HEIGHT * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, CHART_HEIGHT);
    const mid = CHART_HEIGHT / 2;

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(0, yOf(bound), width, yOf(-bound) - yOf(bound));
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();
    ctx.strokeStyle = "#ff66aa";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, yOf(meanMs));
    ctx.lineTo(width, yOf(meanMs));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const h of hits) {
      ctx.fillStyle = JUDGEMENT_COLOR[h.judgement] ?? "#ffffff";
      ctx.beginPath();
      ctx.arc(xOf(h.time), yOf(h.errorMs), 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [hits, width, bound, meanMs, xOf, yOf]);

  const onClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || hits.length === 0) return;
    const x = e.clientX - rect.left;
    let best = hits[0];
    let bestDx = Infinity;
    for (const h of hits) {
      const dx = Math.abs(xOf(h.time) - x);
      if (dx < bestDx) {
        bestDx = dx;
        best = h;
      }
    }
    onSeek(best.time);
  };

  return (
    <Box ref={wrapRef} sx={{ width: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: CHART_HEIGHT, display: "block", cursor: "pointer" }}
        onClick={onClick}
      />
    </Box>
  );
}

/** Rolling unstable rate over a sliding window of the most recent hits. */
function rollingUr(hits: HitTiming[], window = 30): { time: number; ur: number }[] {
  const out: { time: number; ur: number }[] = [];
  for (let i = 0; i < hits.length; i++) {
    const from = Math.max(0, i - window + 1);
    let sum = 0;
    for (let j = from; j <= i; j++) sum += hits[j].errorMs;
    const n = i - from + 1;
    const mean = sum / n;
    let variance = 0;
    for (let j = from; j <= i; j++) variance += (hits[j].errorMs - mean) ** 2;
    out.push({ time: hits[i].time, ur: Math.sqrt(variance / n) * 10 });
  }
  return out;
}

const PAD_L = 30; // room for the Y-axis value labels

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Line chart of the rolling UR over time, with Y-axis values, min/max markers and a hover readout. */
function UrLineChart({ hits, overallUr, onSeek }: { hits: HitTiming[]; overallUr: number; onSeek: (ms: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(300);
  const [hover, setHover] = useState<number | null>(null);
  const points = useMemo(() => rollingUr(hits), [hits]);

  const extremes = useMemo(() => {
    if (points.length === 0) return null;
    let min = points[0];
    let max = points[0];
    for (const p of points) {
      if (p.ur < min.ur) min = p;
      if (p.ur > max.ur) max = p;
    }
    return { min, max };
  }, [points]);

  const tMin = points.length ? points[0].time : 0;
  const tMax = points.length ? points[points.length - 1].time : 1;
  const span = Math.max(1, tMax - tMin);
  const yMax = Math.max(50, overallUr * 1.4, ...points.map((p) => p.ur)) * 1.05;
  const plotW = Math.max(1, width - PAD_L - 4);

  const xOf = useCallback((time: number) => PAD_L + ((time - tMin) / span) * plotW, [tMin, span, plotW]);
  const yOf = useCallback((ur: number) => CHART_HEIGHT - (ur / yMax) * (CHART_HEIGHT - 14) - 10, [yMax]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setWidth(Math.max(180, Math.floor(e[0].contentRect.width))));
    ro.observe(el);
    setWidth(Math.max(180, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = CHART_HEIGHT * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, CHART_HEIGHT);
    ctx.font = "9px sans-serif";
    ctx.textBaseline = "middle";

    // Y gridlines + value labels.
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (let k = 0; k <= 2; k++) {
      const v = (yMax / 2) * k;
      const y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(v.toFixed(0), PAD_L - 4, y);
    }

    // Overall UR reference line.
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD_L, yOf(overallUr));
    ctx.lineTo(width, yOf(overallUr));
    ctx.stroke();
    ctx.setLineDash([]);

    // Rolling UR line.
    if (points.length > 1) {
      ctx.strokeStyle = "#5cc8ff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      points.forEach((p, i) => {
        const x = xOf(p.time);
        const y = yOf(p.ur);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Min / max markers with values.
    const marker = (p: { time: number; ur: number }, color: string, label: string, above: boolean) => {
      const x = xOf(p.time);
      const y = yOf(p.ur);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = x > width - 40 ? "right" : "left";
      ctx.fillText(`${label} ${p.ur.toFixed(0)}`, x + (ctx.textAlign === "right" ? -4 : 4), y + (above ? -8 : 9));
    };
    if (extremes) {
      marker(extremes.max, "#ff6b6b", "max", true);
      marker(extremes.min, "#7bd88f", "min", false);
    }

    // Hover readout.
    if (hover != null && points[hover]) {
      const p = points[hover];
      const x = xOf(p.time);
      const y = yOf(p.ur);
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CHART_HEIGHT);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      const text = `${p.ur.toFixed(0)} UR · ${mmss(p.time)}`;
      ctx.font = "10px sans-serif";
      const tw = ctx.measureText(text).width;
      const bx = Math.min(width - tw - 8, Math.max(PAD_L, x + 6));
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(bx - 3, 2, tw + 6, 15);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.fillText(text, bx, 10);
    }
  }, [points, width, yMax, overallUr, extremes, hover, xOf, yOf]);

  const indexAt = (clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || points.length === 0) return null;
    const ms = tMin + ((clientX - rect.left - PAD_L) / plotW) * span;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].time - ms);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  return (
    <Box ref={wrapRef} sx={{ width: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: CHART_HEIGHT, display: "block", cursor: "pointer" }}
        onMouseMove={(e) => setHover(indexAt(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const i = indexAt(e.clientX);
          if (i != null) onSeek(points[i].time);
        }}
      />
    </Box>
  );
}

/** Inline UR panel (lives in the right-hand coach panel, no dialog). */
export function UrAnalyzerPanel({ analysis, onSeek }: { analysis: CoachAnalysis; onSeek: (ms: number) => void }) {
  const { t } = useTranslation();
  const { timing } = analysis;
  const missCount = analysis.mistakes.filter((m) => m.kind === "Miss").length;

  if (timing.hits.length === 0) {
    return (
      <Typography color={"text.secondary"} sx={{ textAlign: "center", mt: 3 }}>
        {t("coach.noTiming")}
      </Typography>
    );
  }

  const meanSigned = `${timing.meanErrorMs >= 0 ? "+" : "−"}${Math.abs(timing.meanErrorMs).toFixed(1)} ms`;
  const offsetSigned = `${timing.suggestedOffsetMs >= 0 ? "+" : "−"}${Math.abs(Math.round(timing.suggestedOffsetMs))} ms`;
  const earlyLate = timing.meanErrorMs >= 0 ? t("coach.late") : t("coach.early");

  return (
    <Stack gap={1.5} sx={{ overflowY: "auto", pr: 0.5 }}>
      <Stack direction={"row"} gap={1}>
        <StatTile label={t("coach.ur")} value={timing.ur.toFixed(1)} />
        <StatTile label={t("coach.meanError")} value={meanSigned} sub={earlyLate} />
        <StatTile label={t("coach.suggestedOffset")} value={offsetSigned} />
      </Stack>

      <Stack direction={"row"} gap={0.75} flexWrap={"wrap"}>
        <Chip size={"small"} label={`300 × ${timing.counts.great}`} sx={{ bgcolor: JUDGEMENT_COLOR[300], color: "#15151b", fontWeight: 700 }} />
        <Chip size={"small"} label={`100 × ${timing.counts.ok}`} sx={{ bgcolor: JUDGEMENT_COLOR[100], color: "#15151b", fontWeight: 700 }} />
        <Chip size={"small"} label={`50 × ${timing.counts.meh}`} sx={{ bgcolor: JUDGEMENT_COLOR[50], color: "#15151b", fontWeight: 700 }} />
        <Chip size={"small"} label={`${t("playbar.misses")} × ${missCount}`} variant={"outlined"} />
      </Stack>

      <Box>
        <Typography variant={"caption"} color={"text.secondary"}>
          {t("coach.hitErrors")}
        </Typography>
        <HitErrorChart hits={timing.hits} mehMs={analysis.windows.meh} meanMs={timing.meanErrorMs} onSeek={onSeek} />
      </Box>

      <Box>
        <Typography variant={"caption"} color={"text.secondary"}>
          {t("coach.urOverTime")}
        </Typography>
        <UrLineChart hits={timing.hits} overallUr={timing.ur} onSeek={onSeek} />
      </Box>
    </Stack>
  );
}
