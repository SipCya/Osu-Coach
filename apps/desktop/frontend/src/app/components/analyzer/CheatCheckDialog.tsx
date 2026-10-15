import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { OpenInNew, Policy } from "@mui/icons-material";
import { shell } from "electron";
import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { useObservable } from "rxjs-hooks";
import { useTranslation } from "../../i18n";
import { useAnalysisApp } from "../../providers/TheaterProvider";
import { frontendAPI } from "../../api";
import { ignoreFocus } from "../../utils/focus";
import {
  analyzeFrametimes,
  analyzeSnaps,
  cheatVerdict,
  compareReplays,
  computeCheatFlags,
  keyHoldDurationsByKey,
  maxCursorSpeed,
  meanOf,
  SimilarityReport,
  unstableRate,
} from "../../services/analysis/cheat-check";
import { buildCheatReportHtml } from "../../services/analysis/cheat-report";

const ACCENT = "#ff66aa";

/** Milliseconds as m:ss.cs (minutes, not only seconds). */
function formatTimestamp(ms: number): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const cs = Math.floor((t % 1000) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant={"subtitle2"} sx={{ fontWeight: 700, mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Histogram({ buckets }: { buckets: { ms: number; count: number }[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <Stack direction={"row"} alignItems={"flex-end"} gap={0.3} sx={{ height: 90, mt: 1 }}>
      {buckets.map((b) => (
        <Tooltip key={b.ms} title={`${b.ms}-${b.ms + 2}ms: ${b.count}`}>
          <Box
            sx={{
              flex: 1,
              height: `${(b.count / max) * 100}%`,
              minHeight: b.count > 0 ? 2 : 0,
              backgroundColor: ACCENT,
              borderRadius: 0.5,
            }}
          />
        </Tooltip>
      ))}
    </Stack>
  );
}

function CheatDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const analyzer = useAnalysisApp();
  const replay = useObservable(() => analyzer.replayManager.mainReplay$, analyzer.replayManager.getMainReplay());

  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState<{ player: string; report: SimilarityReport } | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const jumpTo = (ms: number) => {
    analyzer.gameClock.pause();
    analyzer.gameClock.seekTo(ms);
    onClose();
  };

  const openReport = async () => {
    if (!replay || !reports) return;
    const beatmap = analyzer.beatmapManager.getBeatmap() as { metadata?: { title?: string } };
    const html = buildCheatReportHtml({
      player: replay.player,
      title: beatmap?.metadata?.title ?? "osu! replay",
      ur: reports.ur,
      meanError: meanOf(reports.offsets),
      offsets: reports.offsets,
      holdDurations: reports.holdDurations,
      leftHolds: reports.leftHolds,
      rightHolds: reports.rightHolds,
      frametime: reports.frametime,
      snaps: reports.snaps.snaps,
      maxCursorSpeed: reports.maxSpeed,
      flags: reports.flags,
    });
    const file = join(tmpdir(), `osucoach-cheat-report-${Date.now()}.html`);
    await writeFile(file, html, "utf-8");
    await shell.openPath(file);
  };

  const reports = useMemo(() => {
    if (!replay) return null;
    const rate = analyzer.beatmapManager.getBeatmap()?.gameClockRate ?? 1;
    const offsets = analyzer.gameSimulator.hits.map(([, offset]) => offset / rate);
    const hitTimes = analyzer.gameSimulator.hits.filter(([, , hit]) => hit).map(([time]) => time);
    const frametime = analyzeFrametimes(replay.frames);
    const snaps = analyzeSnaps(replay.frames);
    const { left, right } = keyHoldDurationsByKey(replay.frames, hitTimes);
    const holdDurations = [...left, ...right];
    const maxSpeed = maxCursorSpeed(replay.frames);
    const flags = computeCheatFlags({
      frametime,
      offsets,
      holdDurations,
      leftHolds: left,
      rightHolds: right,
      snaps: snaps.snaps,
      maxCursorSpeed: maxSpeed,
    });
    return { ur: unstableRate(offsets), frametime, snaps, offsets, holdDurations, leftHolds: left, rightHolds: right, maxSpeed, flags };
  }, [replay, analyzer]);

  const compare = async () => {
    if (!replay) return;
    setCompareError(null);
    const path = await frontendAPI.selectFile("");
    if (!path || !path.toLowerCase().endsWith(".osr")) return;
    setComparing(true);
    try {
      const other = await analyzer.parseReplay(path);
      setComparison({ player: other.player, report: compareReplays(replay.frames, other.frames) });
    } catch (e) {
      setCompareError((e as Error).message);
    } finally {
      setComparing(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth={"sm"}>
      <DialogTitle>{t("cheat.title")}</DialogTitle>
      <DialogContent dividers>
        {!replay ? (
          <Alert severity={"info"}>{t("cheat.noReplay")}</Alert>
        ) : (
          <>
            <Alert severity={"warning"} sx={{ mb: 1 }}>
              {t("cheat.disclaimer")}
            </Alert>
            <Button
              variant={"outlined"}
              size={"small"}
              startIcon={<OpenInNew />}
              onClick={openReport}
              sx={{ color: ACCENT, borderColor: ACCENT, mb: 1 }}
            >
              {t("cheat.openReport")}
            </Button>
            <Typography variant={"body2"} color={"text.secondary"}>
              {t("cheat.player", { player: replay.player })}
            </Typography>

            {reports &&
              (() => {
                const verdict = cheatVerdict(reports.flags);
                const color = verdict === "suspicious" ? "#ff5c5c" : verdict === "review" ? "#ffb347" : "#4caf50";
                return (
                  <Box sx={{ mt: 1 }}>
                    <Chip
                      label={t(
                        verdict === "suspicious"
                          ? "cheat.verdictSuspicious"
                          : verdict === "review"
                          ? "cheat.verdictReview"
                          : "cheat.verdictLegit",
                      )}
                      sx={{ backgroundColor: color, color: "#15151b", fontWeight: 800, mb: 1 }}
                    />
                    {reports.flags.length === 0 ? (
                      <Alert severity={"success"}>{t("cheat.noFlags")}</Alert>
                    ) : (
                      <Stack gap={0.5}>
                        {reports.flags.map((f) => (
                          <Alert
                            key={f.id}
                            severity={f.severity === "high" ? "error" : f.severity === "medium" ? "warning" : "info"}
                            sx={{ py: 0.1 }}
                          >
                            <b>{f.title}</b> — {f.detail}
                          </Alert>
                        ))}
                      </Stack>
                    )}
                  </Box>
                );
              })()}

            <Section title={t("cheat.ur")}>
              <Typography variant={"h5"} sx={{ fontWeight: 800, color: ACCENT }}>
                {reports ? reports.ur.toFixed(1) : "–"}
              </Typography>
              <Typography variant={"caption"} color={"text.secondary"}>
                {t("cheat.urNote")}
              </Typography>
            </Section>

            <Divider />
            <Section title={t("cheat.frametime")}>
              {reports && (
                <>
                  <Typography variant={"body2"}>
                    {t("cheat.frametimeNote", {
                      median: reports.frametime.medianMs.toFixed(1),
                      fps: Math.round(reports.frametime.impliedFps),
                    })}
                  </Typography>
                  <Histogram buckets={reports.frametime.histogram} />
                  {reports.frametime.suspicious && (
                    <Alert severity={"warning"} sx={{ mt: 1 }}>
                      {t("cheat.timewarpFlag")}
                    </Alert>
                  )}
                </>
              )}
            </Section>

            <Divider />
            <Section title={t("cheat.snaps")}>
              {reports &&
                (reports.snaps.count > 0 ? (
                  <>
                    <Typography variant={"body2"}>{t("cheat.snapsNote", { count: reports.snaps.count })}</Typography>
                    <Stack direction={"row"} gap={0.5} flexWrap={"wrap"} sx={{ mt: 1 }}>
                      {reports.snaps.snaps.slice(0, 12).map((s, i) => (
                        <Tooltip key={i} title={t("cheat.jumpTo")}>
                          <Chip
                            size={"small"}
                            variant={"outlined"}
                            clickable
                            onClick={() => jumpTo(s.time)}
                            label={`${formatTimestamp(s.time)} · ${s.angleDeg.toFixed(0)}°`}
                          />
                        </Tooltip>
                      ))}
                    </Stack>
                  </>
                ) : (
                  <Typography variant={"body2"} color={"text.secondary"}>
                    {t("cheat.noSnaps")}
                  </Typography>
                ))}
            </Section>

            <Divider />
            <Section title={t("cheat.compare")}>
              <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block", mb: 1 }}>
                {t("cheat.compareHint")}
              </Typography>
              <Button
                variant={"outlined"}
                size={"small"}
                onClick={compare}
                disabled={comparing}
                startIcon={comparing ? <CircularProgress size={16} /> : undefined}
                sx={{ color: ACCENT, borderColor: ACCENT }}
              >
                {t("cheat.compare")}
              </Button>
              {compareError && (
                <Alert severity={"error"} sx={{ mt: 1 }}>
                  {compareError}
                </Alert>
              )}
              {comparison &&
                (comparison.report.verdict === "no-overlap" ? (
                  <Alert severity={"info"} sx={{ mt: 1 }}>
                    {t("cheat.verdictNoOverlap")}
                  </Alert>
                ) : (
                  <Alert
                    severity={
                      comparison.report.verdict === "different"
                        ? "success"
                        : comparison.report.verdict === "similar"
                        ? "warning"
                        : "error"
                    }
                    sx={{ mt: 1 }}
                  >
                    <Typography variant={"body2"} sx={{ fontWeight: 700 }}>
                      {t("cheat.vs", { a: replay.player, b: comparison.player })}
                    </Typography>
                    {t(
                      comparison.report.verdict === "identical"
                        ? "cheat.verdictIdentical"
                        : comparison.report.verdict === "similar"
                        ? "cheat.verdictSimilar"
                        : "cheat.verdictDifferent",
                    )}{" "}
                    —{" "}
                    {t("cheat.similarity", {
                      dist: comparison.report.meanDistance.toFixed(1),
                      samples: comparison.report.samples,
                    })}
                  </Alert>
                ))}
            </Section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CheatCheckButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title={t("cheat.title")}>
        <IconButton onClick={() => setOpen(true)} onFocus={ignoreFocus}>
          <Policy />
        </IconButton>
      </Tooltip>
      {open && <CheatDialog onClose={() => setOpen(false)} />}
    </>
  );
}
