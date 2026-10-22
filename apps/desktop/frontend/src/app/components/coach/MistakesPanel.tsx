import { ReactElement, useMemo, useState } from "react";
import { Box, Button, Checkbox, FormControlLabel, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useObservable } from "rxjs-hooks";
import { useAnalysisApp } from "../../providers/TheaterProvider";
import { CATEGORY_COLORS, CoachAnalysis, HitTiming, Mistake } from "../../services/coach/mistakes";
import { ignoreFocus } from "../../utils/focus";
import { MistakeAnalysisDialog } from "./MistakeAnalysisDialog";
import { UrAnalyzerPanel, JUDGEMENT_COLOR } from "./UrAnalyzerPanel";
import { CoachingPanel } from "./CoachingPanel";
import { useTranslation } from "../../i18n";

type TopTab = "mistakes" | "ur" | "progress";
type Category = "all" | "aim" | "tapping" | "other";

export function formatTime(ms: number) {
  const t = Math.max(0, Math.round(ms));
  const min = Math.floor(t / 60000);
  const sec = Math.floor(t / 1000) % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(t % 1000).padStart(3, "0")}`;
}

const LEAD_MS = 1200;

export function MistakesPanel() {
  const app = useAnalysisApp();
  const { t, tMsg } = useTranslation();
  const coach = useObservable<CoachAnalysis | null>(() => app.gameSimulator.coach$, null);
  const [tab, setTab] = useState<TopTab>("mistakes");
  const [filter, setFilter] = useState<Category>("all");
  const [show100, setShow100] = useState(false);
  const [show50, setShow50] = useState(false);
  const [groupByType, setGroupByType] = useState(false);
  const [selected, setSelected] = useState<Mistake | null>(null);

  const mistakes = useMemo(() => {
    const all = coach?.mistakes ?? [];
    switch (filter) {
      case "aim":
        return all.filter((m) => m.category === "Aim");
      case "tapping":
        return all.filter((m) => m.category === "Tapping");
      case "other":
        return all.filter((m) => m.category !== "Aim" && m.category !== "Tapping");
      default:
        return all;
    }
  }, [coach, filter]);

  const hits100 = useMemo(() => (coach?.timing.hits ?? []).filter((h) => h.judgement === 100), [coach]);
  const hits50 = useMemo(() => (coach?.timing.hits ?? []).filter((h) => h.judgement === 50), [coach]);

  const seekTo = (ms: number) => {
    app.gameClock.pause();
    app.gameClock.seekTo(Math.max(0, ms - LEAD_MS));
  };

  const review = (m: Mistake) => {
    app.gameClock.seekTo(Math.max(0, m.time - 1500));
    app.gameClock.setSpeed(0.5);
    app.gameClock.start();
    setSelected(null);
  };

  const hasTiming = !!coach && coach.timing.hits.length > 0;

  const renderMistake = (m: Mistake) => {
    const color = CATEGORY_COLORS[m.category];
    return (
      <Stack
        key={m.id}
        direction={"row"}
        alignItems={"center"}
        gap={1.25}
        onClick={() => seekTo(m.time)}
        sx={{
          p: 1,
          pl: 1.25,
          borderRadius: 2,
          cursor: "pointer",
          backgroundColor: "rgba(255,255,255,0.04)",
          borderLeft: `3px solid ${color}`,
          "&:hover": { backgroundColor: "rgba(255,255,255,0.08)" },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant={"body2"} sx={{ fontWeight: 700 }}>
            {formatTime(m.time)} · {m.kind}
          </Typography>
          <Typography variant={"caption"} color={"text.secondary"} noWrap component={"div"}>
            <Box component={"span"} sx={{ color }}>
              {m.category}
            </Box>{" "}
            · {tMsg(m.title)}
          </Typography>
        </Box>
        <Button
          size={"small"}
          variant={"contained"}
          onFocus={ignoreFocus}
          onClick={(e) => {
            e.stopPropagation();
            setSelected(m);
          }}
          sx={{
            minWidth: 0,
            px: 1.25,
            backgroundColor: color,
            color: "#15151b",
            fontWeight: 700,
            "&:hover": { backgroundColor: color, filter: "brightness(0.9)" },
          }}
        >
          {t("coach.analysis")}
        </Button>
      </Stack>
    );
  };

  const renderTiming = (h: HitTiming) => {
    const color = JUDGEMENT_COLOR[h.judgement];
    const signed = `${h.errorMs >= 0 ? "+" : "−"}${Math.abs(Math.round(h.errorMs))} ms`;
    return (
      <Stack
        key={h.hitObjectId}
        direction={"row"}
        alignItems={"center"}
        gap={1}
        onClick={() => seekTo(h.time)}
        sx={{
          p: 0.85,
          px: 1.25,
          borderRadius: 2,
          cursor: "pointer",
          bgcolor: "rgba(255,255,255,0.04)",
          borderLeft: `3px solid ${color}`,
          "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
        }}
      >
        <Typography variant={"body2"} sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {formatTime(h.time)}
        </Typography>
        <Box component={"span"} sx={{ color, fontWeight: 800 }}>
          {h.judgement}
        </Box>
        <Typography variant={"caption"} color={"text.secondary"} sx={{ ml: "auto", fontVariantNumeric: "tabular-nums" }}>
          {signed} · {h.errorMs >= 0 ? t("coach.late") : t("coach.early")}
        </Typography>
      </Stack>
    );
  };

  const total = mistakes.length + (show100 ? hits100.length : 0) + (show50 ? hits50.length : 0);

  const list = () => {
    if (total === 0) {
      return (
        <Typography color={"text.secondary"} sx={{ textAlign: "center", mt: 3 }}>
          {t("coach.noneHere")}
        </Typography>
      );
    }
    if (groupByType) {
      // All mistakes together, then all 100s, then all 50s (each by time).
      return (
        <Stack gap={1.5}>
          {mistakes.length > 0 && (
            <Stack gap={1}>
              <Typography variant={"caption"} color={"text.secondary"}>
                {t("coach.mistakes")}
              </Typography>
              {mistakes.map(renderMistake)}
            </Stack>
          )}
          {show100 && hits100.length > 0 && (
            <Stack gap={0.75}>
              <Typography variant={"caption"} sx={{ color: JUDGEMENT_COLOR[100], fontWeight: 700 }}>
                100
              </Typography>
              {hits100.map(renderTiming)}
            </Stack>
          )}
          {show50 && hits50.length > 0 && (
            <Stack gap={0.75}>
              <Typography variant={"caption"} sx={{ color: JUDGEMENT_COLOR[50], fontWeight: 700 }}>
                50
              </Typography>
              {hits50.map(renderTiming)}
            </Stack>
          )}
        </Stack>
      );
    }
    // Interleaved by time.
    const items: { time: number; node: ReactElement }[] = [
      ...mistakes.map((m) => ({ time: m.time, node: renderMistake(m) })),
      ...(show100 ? hits100 : []).map((h) => ({ time: h.time, node: renderTiming(h) })),
      ...(show50 ? hits50 : []).map((h) => ({ time: h.time, node: renderTiming(h) })),
    ].sort((a, b) => a.time - b.time);
    return <Stack gap={0.85}>{items.map((i) => i.node)}</Stack>;
  };

  return (
    <Paper elevation={1} sx={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", p: 1.5, gap: 1.5 }}>
      <ToggleButtonGroup size={"small"} exclusive fullWidth value={tab} onChange={(_, v: TopTab | null) => v && setTab(v)}>
        <ToggleButton value={"mistakes"} onFocus={ignoreFocus} sx={{ textTransform: "none", fontWeight: 700 }}>
          {t("coach.mistakes")}
        </ToggleButton>
        <ToggleButton value={"ur"} onFocus={ignoreFocus} sx={{ textTransform: "none", fontWeight: 700 }}>
          {t("coach.urAnalyzer")}
        </ToggleButton>
        <ToggleButton value={"progress"} onFocus={ignoreFocus} sx={{ textTransform: "none", fontWeight: 700 }}>
          {t("coach.progress")}
        </ToggleButton>
      </ToggleButtonGroup>

      {tab === "mistakes" && (
        <>
          <Typography variant={"body2"} color={"text.secondary"}>
            {coach ? t("coach.inThisPlay", { count: coach.mistakes.length }) : t("coach.noReplay")}
          </Typography>

          <ToggleButtonGroup
            size={"small"}
            exclusive
            fullWidth
            value={filter}
            onChange={(_, value: Category | null) => value && setFilter(value)}
          >
            <ToggleButton value={"all"} onFocus={ignoreFocus}>
              {t("coach.filterAll")}
            </ToggleButton>
            <ToggleButton value={"aim"} onFocus={ignoreFocus}>
              Aim
            </ToggleButton>
            <ToggleButton value={"tapping"} onFocus={ignoreFocus}>
              Tapping
            </ToggleButton>
            <ToggleButton value={"other"} onFocus={ignoreFocus}>
              {t("coach.filterOther")}
            </ToggleButton>
          </ToggleButtonGroup>

          <Stack direction={"row"} alignItems={"center"} flexWrap={"wrap"} sx={{ mt: -0.5 }}>
            <FormControlLabel
              control={<Checkbox size={"small"} checked={show100} disabled={!hasTiming} onChange={(e) => setShow100(e.target.checked)} sx={{ color: JUDGEMENT_COLOR[100], "&.Mui-checked": { color: JUDGEMENT_COLOR[100] } }} />}
              label={<Typography variant={"body2"} sx={{ fontWeight: 700 }}>100</Typography>}
              sx={{ mr: 1 }}
            />
            <FormControlLabel
              control={<Checkbox size={"small"} checked={show50} disabled={!hasTiming} onChange={(e) => setShow50(e.target.checked)} sx={{ color: JUDGEMENT_COLOR[50], "&.Mui-checked": { color: JUDGEMENT_COLOR[50] } }} />}
              label={<Typography variant={"body2"} sx={{ fontWeight: 700 }}>50</Typography>}
              sx={{ mr: 1 }}
            />
            <FormControlLabel
              control={<Checkbox size={"small"} checked={groupByType} onChange={(e) => setGroupByType(e.target.checked)} />}
              label={<Typography variant={"body2"}>{t("coach.groupByType")}</Typography>}
            />
          </Stack>

          <Box sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>{list()}</Box>

          <Typography variant={"caption"} color={"text.secondary"}>
            {t("coach.footer")}
          </Typography>
        </>
      )}

      {tab === "ur" && (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {coach ? (
            <UrAnalyzerPanel analysis={coach} onSeek={seekTo} />
          ) : (
            <Typography color={"text.secondary"} sx={{ textAlign: "center", mt: 3 }}>
              {t("coach.noReplay")}
            </Typography>
          )}
        </Box>
      )}

      {tab === "progress" && <CoachingPanel />}

      {selected && coach && (
        <MistakeAnalysisDialog
          mistake={selected}
          analysis={coach}
          beatmap={app.beatmapManager.getBeatmap()}
          onClose={() => setSelected(null)}
          onReview={review}
        />
      )}
    </Paper>
  );
}
