import { useMemo, useState } from "react";
import { Box, Button, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useObservable } from "rxjs-hooks";
import { useAnalysisApp } from "../../providers/TheaterProvider";
import { CATEGORY_COLORS, CoachAnalysis, Mistake } from "../../services/coach/mistakes";
import { ignoreFocus } from "../../utils/focus";
import { MistakeAnalysisDialog } from "./MistakeAnalysisDialog";
import { useTranslation } from "../../i18n";

type Filter = "all" | "aim" | "tapping" | "other";

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

  const goTo = (m: Mistake) => {
    app.gameClock.pause();
    app.gameClock.seekTo(Math.max(0, m.time - LEAD_MS));
  };

  const review = (m: Mistake) => {
    app.gameClock.seekTo(Math.max(0, m.time - 1500));
    app.gameClock.setSpeed(0.5);
    app.gameClock.start();
    setSelected(null);
  };

  return (
    <Paper elevation={1} sx={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", p: 1.5, gap: 1.5 }}>
      <Stack direction={"row"} alignItems={"baseline"} justifyContent={"space-between"}>
        <Typography variant={"h6"} sx={{ fontWeight: 700 }}>
          {t("coach.mistakes")}
        </Typography>
        <Typography variant={"body2"} color={"text.secondary"}>
          {coach ? t("coach.inThisPlay", { count: coach.mistakes.length }) : t("coach.noReplay")}
        </Typography>
      </Stack>

      <ToggleButtonGroup
        size={"small"}
        exclusive
        fullWidth
        value={filter}
        onChange={(_, value: Filter | null) => value && setFilter(value)}
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

      <Box sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
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
                onClick={() => goTo(m)}
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
      </Box>

      <Typography variant={"caption"} color={"text.secondary"}>
        {t("coach.footer")}
      </Typography>

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
