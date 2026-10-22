import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, MenuItem, Select, Stack, Typography } from "@mui/material";
import { DeleteOutline, Person } from "@mui/icons-material";
import { useObservable } from "rxjs-hooks";
import { useTranslation } from "../../i18n";
import {
  clearPlayerHistory,
  coachingHistory$,
  CoachingEntry,
  preferredPlayer$,
  setPreferredPlayer,
} from "../../services/coach/coaching-history";
import { CATEGORY_COLORS } from "../../services/coach/mistakes";

const ACCENT = "#ff66aa";

/** Short acronyms for the mods stored on an entry (long osu! names → HD/DT/… ). */
const MOD_ACRONYM: Record<string, string> = {
  HIDDEN: "HD",
  HARD_ROCK: "HR",
  DOUBLE_TIME: "DT",
  NIGHTCORE: "NC",
  HALF_TIME: "HT",
  EASY: "EZ",
  FLASH_LIGHT: "FL",
  NO_FAIL: "NF",
  SUDDEN_DEATH: "SD",
  PERFECT: "PF",
  SPUN_OUT: "SO",
  RELAX: "RX",
  AUTOPILOT: "AP",
};
const modAcronyms = (mods: string[]) => mods.map((m) => MOD_ACRONYM[m] ?? m).join("");

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box sx={{ flex: 1, bgcolor: "rgba(255,255,255,0.04)", borderRadius: 2, p: 1, textAlign: "center", minWidth: 0 }}>
      <Typography sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", fontSize: "1.1rem" }} noWrap>
        {value}
      </Typography>
      <Typography variant={"caption"} color={"text.secondary"} noWrap component={"div"}>
        {label}
      </Typography>
      {sub && (
        <Typography variant={"caption"} sx={{ display: "block", color: ACCENT }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

/** Tiny UR-over-plays sparkline (oldest → newest). */
function Sparkline({ values }: { values: number[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(300);
  const wrap = useRef<HTMLDivElement | null>(null);
  const H = 40;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setWidth(Math.max(120, Math.floor(e[0].contentRect.width))));
    ro.observe(el);
    setWidth(Math.max(120, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || values.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, H);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = Math.max(1, hi - lo);
    const x = (i: number) => (i / (values.length - 1)) * (width - 2) + 1;
    const y = (v: number) => H - 3 - ((v - lo) / span) * (H - 6);
    ctx.strokeStyle = "#5cc8ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
    ctx.stroke();
    // Highlight the latest point.
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(x(values.length - 1), y(values[values.length - 1]), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }, [values, width]);

  return (
    <Box ref={wrap} sx={{ width: "100%" }}>
      <canvas ref={ref} style={{ width: "100%", height: H, display: "block" }} />
    </Box>
  );
}

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString();

export function CoachingPanel() {
  const { t } = useTranslation();
  const allHistory = useObservable(() => coachingHistory$, coachingHistory$.getValue());
  const preferred = useObservable(() => preferredPlayer$, preferredPlayer$.getValue());

  // Players seen in the history, most-analysed first. The default is the most-analysed one
  // (most likely "you"); reviewing someone else's replay lands under their own name instead.
  const players = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of allHistory) counts.set(e.player, (counts.get(e.player) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [allHistory]);

  const selectedPlayer =
    preferred && players.some((p) => p.name === preferred) ? preferred : players[0]?.name ?? "";
  const history = useMemo(
    () => allHistory.filter((e) => e.player === selectedPlayer),
    [allHistory, selectedPlayer],
  );

  const stats = useMemo(() => {
    const plays = history.length;
    const urs = history.map((e) => e.ur);
    const half = Math.floor(plays / 2);
    const aim = history.reduce((a, e) => a + e.misses.aim, 0);
    const tapping = history.reduce((a, e) => a + e.misses.tapping, 0);
    const other = history.reduce((a, e) => a + e.misses.other, 0);
    return {
      plays,
      avgAcc: mean(history.map((e) => e.accuracy)),
      avgUr: mean(urs),
      avgOffset: mean(history.map((e) => e.suggestedOffsetMs)),
      aim,
      tapping,
      other,
      totalMiss: aim + tapping + other,
      // Negative delta = UR dropped = more consistent = improving.
      urDelta: plays >= 4 ? mean(urs.slice(half)) - mean(urs.slice(0, half)) : 0,
      recentUrs: urs.slice(-20),
    };
  }, [history]);

  const suggestions = useMemo(() => {
    const out: string[] = [];
    const { aim, tapping, totalMiss, avgOffset, urDelta, plays } = stats;
    if (totalMiss >= 5) {
      if (aim > tapping * 1.3) out.push(t("coach.sugAim", { pct: Math.round((aim / totalMiss) * 100) }));
      else if (tapping > aim * 1.3) out.push(t("coach.sugTapping", { pct: Math.round((tapping / totalMiss) * 100) }));
      else out.push(t("coach.sugBalanced"));
    }
    if (Math.abs(avgOffset) >= 5) {
      const dir = avgOffset >= 0 ? t("coach.late") : t("coach.early");
      const sign = avgOffset >= 0 ? "+" : "−";
      out.push(t("coach.sugOffset", { dir, offset: `${sign}${Math.abs(Math.round(avgOffset))}` }));
    }
    if (plays >= 4) {
      if (urDelta <= -5) out.push(t("coach.sugTrendUp"));
      else if (urDelta >= 5) out.push(t("coach.sugTrendDown"));
    }
    return out;
  }, [stats, t]);

  if (history.length === 0) {
    return (
      <Typography color={"text.secondary"} sx={{ textAlign: "center", mt: 3 }}>
        {t("coach.noHistory")}
      </Typography>
    );
  }

  const weakness =
    stats.totalMiss < 5
      ? null
      : stats.aim > stats.tapping * 1.3
      ? { label: "Aim", color: CATEGORY_COLORS.Aim, pct: Math.round((stats.aim / stats.totalMiss) * 100) }
      : stats.tapping > stats.aim * 1.3
      ? { label: "Tapping", color: CATEGORY_COLORS.Tapping, pct: Math.round((stats.tapping / stats.totalMiss) * 100) }
      : null;

  const offsetSigned = `${stats.avgOffset >= 0 ? "+" : "−"}${Math.abs(Math.round(stats.avgOffset))} ms`;

  return (
    <Stack gap={1.5} sx={{ flex: 1, minHeight: 0, overflowY: "auto", pr: 0.5 }}>
      <Stack direction={"row"} alignItems={"center"} gap={1}>
        <Person fontSize={"small"} sx={{ color: "text.secondary" }} />
        {players.length > 1 ? (
          <Select
            size={"small"}
            value={selectedPlayer}
            onChange={(e) => setPreferredPlayer(e.target.value)}
            sx={{ flex: 1, ".MuiSelect-select": { py: 0.5, fontWeight: 700, fontSize: "0.85rem" } }}
          >
            {players.map((p) => (
              <MenuItem key={p.name} value={p.name}>
                {p.name} ({p.count})
              </MenuItem>
            ))}
          </Select>
        ) : (
          <Typography variant={"body2"} sx={{ fontWeight: 700 }} noWrap>
            {selectedPlayer}
          </Typography>
        )}
      </Stack>

      <Stack direction={"row"} gap={1}>
        <StatTile label={t("coach.plays")} value={String(stats.plays)} />
        <StatTile label={t("coach.avgAcc")} value={`${(stats.avgAcc * 100).toFixed(2)}%`} />
        <StatTile label={t("coach.avgUr")} value={stats.avgUr.toFixed(0)} />
        <StatTile label={t("coach.typicalOffset")} value={offsetSigned} />
      </Stack>

      {weakness && (
        <Box sx={{ bgcolor: "rgba(255,255,255,0.04)", borderRadius: 2, p: 1.25, borderLeft: `3px solid ${weakness.color}` }}>
          <Typography variant={"caption"} color={"text.secondary"}>
            {t("coach.mainWeakness")}
          </Typography>
          <Typography sx={{ fontWeight: 800 }}>
            <Box component={"span"} sx={{ color: weakness.color }}>
              {weakness.label}
            </Box>{" "}
            · {t("coach.ofMisses", { pct: weakness.pct })}
          </Typography>
        </Box>
      )}

      {stats.recentUrs.length >= 2 && (
        <Box>
          <Typography variant={"caption"} color={"text.secondary"}>
            {t("coach.urTrend")} ·{" "}
            {stats.urDelta <= -5 ? t("coach.trendUp") : stats.urDelta >= 5 ? t("coach.trendDown") : t("coach.trendStable")}
          </Typography>
          <Sparkline values={stats.recentUrs} />
        </Box>
      )}

      {suggestions.length > 0 && (
        <Box>
          <Typography variant={"caption"} color={"text.secondary"}>
            {t("coach.suggestions")}
          </Typography>
          <Stack gap={0.75} sx={{ mt: 0.5 }}>
            {suggestions.map((s, i) => (
              <Typography key={i} variant={"body2"} sx={{ bgcolor: "rgba(255,102,170,0.08)", borderRadius: 1.5, p: 1 }}>
                {s}
              </Typography>
            ))}
          </Stack>
        </Box>
      )}

      <Box>
        <Typography variant={"caption"} color={"text.secondary"}>
          {t("coach.recentPlays")}
        </Typography>
        <Stack gap={0.75} sx={{ mt: 0.5 }}>
          {[...history]
            .reverse()
            .slice(0, 12)
            .map((e: CoachingEntry) => (
              <Stack
                key={e.replayHash + e.date}
                direction={"row"}
                alignItems={"center"}
                gap={1}
                sx={{ p: 0.85, px: 1.1, borderRadius: 2, bgcolor: "rgba(255,255,255,0.04)" }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant={"body2"} sx={{ fontWeight: 700 }} noWrap>
                    {e.title || "—"}
                    {e.mods.length > 0 && (
                      <Box component={"span"} sx={{ color: ACCENT, ml: 0.5 }}>
                        +{modAcronyms(e.mods)}
                      </Box>
                    )}
                  </Typography>
                  <Typography variant={"caption"} color={"text.secondary"} noWrap component={"div"}>
                    {fmtDate(e.date)} · {(e.accuracy * 100).toFixed(2)}% · UR {e.ur.toFixed(0)}
                  </Typography>
                </Box>
              </Stack>
            ))}
        </Stack>
      </Box>

      <Button
        size={"small"}
        color={"inherit"}
        startIcon={<DeleteOutline />}
        onClick={() => selectedPlayer && clearPlayerHistory(selectedPlayer)}
        sx={{ alignSelf: "flex-start", textTransform: "none", mt: "auto" }}
      >
        {t("coach.clearHistory")}
      </Button>
    </Stack>
  );
}
