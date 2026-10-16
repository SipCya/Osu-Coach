import { useCallback, useEffect, useRef, useState } from "react";
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
    </Stack>
  );
}
