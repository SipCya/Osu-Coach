import { useMemo, useState } from "react";
import { Box, Button, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useObservable } from "rxjs-hooks";
import { useAnalysisApp } from "../../providers/TheaterProvider";
import { CATEGORY_COLORS, CoachAnalysis, HitTiming, Mistake } from "../../services/coach/mistakes";
import { ignoreFocus } from "../../utils/focus";
import { MistakeAnalysisDialog } from "./MistakeAnalysisDialog";
import { UrAnalyzerPanel, JUDGEMENT_COLOR } from "./UrAnalyzerPanel";
import { useTranslation } from "../../i18n";

type TopTab = "mistakes" | "ur";
type Filter = "all" | "aim" | "tapping" | "other" | "100" | "50";

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
  const [filter, setFilter] = useState<Filter>("all");
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

  const timingRows = useMemo(() => {
    const hits = coach?.timing.hits ?? [];
    if (filter === "100") return hits.filter((h) => h.judgement === 100);
    if (filter === "50") return hits.filter((h) => h.judgement === 50);
    return [];
  }, [coach, filter]);

  const showTiming = filter === "100" || filter === "50";

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

  return (
    <Paper elevation={1} sx={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", p: 1.5, gap: 1.5 }}>
      <ToggleButtonGroup
        size={"small"}
        exclusive
        fullWidth
        value={tab}
        onChange={(_, v: TopTab | null) => v && setTab(v)}
      >
        <ToggleButton value={"mistakes"} onFocus={ignoreFocus} sx={{ textTransform: "none", fontWeight: 700 }}>
          {t("coach.mistakes")}
        </ToggleButton>
        <ToggleButton value={"ur"} onFocus={ignoreFocus} sx={{ textTransform: "none", fontWeight: 700 }}>
          {t("coach.urAnalyzer")}
        </ToggleButton>
      </ToggleButtonGroup>

      {tab === "mistakes" && (
        <>
          <Stack direction={"row"} alignItems={"baseline"} justifyContent={"space-between"}>
            <Typography variant={"body2"} color={"text.secondary"}>
              {coach ? t("coach.inThisPlay", { count: coach.mistakes.length }) : t("coach.noReplay")}
            </Typography>
          </Stack>

          <ToggleButtonGroup
            size={"small"}
            exclusive
            value={filter}
            onChange={(_, value: Filter | null) => value && setFilter(value)}
            sx={{ flexWrap: "wrap", "& .MuiToggleButton-root": { flex: "1 0 30%", py: 0.3 } }}
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
            <ToggleButton value={"100"} onFocus={ignoreFocus} disabled={!hasTiming}>
              100
            </ToggleButton>
            <ToggleButton value={"50"} onFocus={ignoreFocus} disabled={!hasTiming}>
              50
            </ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
            {showTiming ? (
              <TimingList rows={timingRows} onSeek={seekTo} emptyLabel={t("coach.noneHere")} lateLabel={t("coach.late")} earlyLabel={t("coach.early")} />
            ) : (
              <>
                {coach && mistakes.length === 0 && (
                  <Typography color={"text.secondary"} sx={{ textAlign: "center", mt: 3 }}>
                    {t("coach.noneHere")}
                  </Typography>
                )}
                <Stack gap={1}>
                  {mistakes.map((m) => {
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
                  })}
                </Stack>
              </>
            )}
          </Box>

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

function TimingList({
  rows,
  onSeek,
  emptyLabel,
  lateLabel,
  earlyLabel,
}: {
  rows: HitTiming[];
  onSeek: (ms: number) => void;
  emptyLabel: string;
  lateLabel: string;
  earlyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <Typography color={"text.secondary"} sx={{ textAlign: "center", mt: 3 }}>
        {emptyLabel}
      </Typography>
    );
  }
  return (
    <Stack gap={0.75}>
      {rows.map((h) => {
        const color = JUDGEMENT_COLOR[h.judgement];
        const signed = `${h.errorMs >= 0 ? "+" : "−"}${Math.abs(Math.round(h.errorMs))} ms`;
        return (
          <Stack
            key={h.hitObjectId}
            direction={"row"}
            alignItems={"center"}
            gap={1}
            onClick={() => onSeek(h.time)}
            sx={{
              p: 0.75,
              px: 1,
              borderRadius: 1.5,
              cursor: "pointer",
              bgcolor: "rgba(255,255,255,0.04)",
              borderLeft: `3px solid ${color}`,
              "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
            }}
          >
            <Typography variant={"body2"} sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {formatTime(h.time)}
            </Typography>
            <Box component={"span"} sx={{ color, fontWeight: 700 }}>
              {h.judgement}
            </Box>
            <Typography variant={"caption"} color={"text.secondary"} sx={{ ml: "auto", fontVariantNumeric: "tabular-nums" }}>
              {signed} · {h.errorMs >= 0 ? lateLabel : earlyLabel}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}
