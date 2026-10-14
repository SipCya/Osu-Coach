import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Popover,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add,
  Delete,
  FastForward,
  FastRewind,
  FirstPage,
  LastPage,
  PauseCircle,
  PlayCircle,
  VolumeOff,
  VolumeUp,
} from "@mui/icons-material";
import { useObservable } from "rxjs-hooks";
import { ipcRenderer, shell } from "electron";
import { readdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { useTranslation } from "../../i18n";
import { tosuWatcher } from "../../services/speed-changer/tosu";
import { frontendAPI } from "../../api";
import { useAnalysisApp } from "../../providers/TheaterProvider";
import { useGameClock, useGameClockControls, useGameClockTime } from "../../hooks/game-clock";
import { useAudioSettings, useAudioSettingsService } from "../../hooks/audio";
import { VolumeSlider } from "../../components/analyzer/BaseAudioSettingsPanel";
import {
  createPracticeBeatmap,
  DifficultyFile,
  formatTime,
  PRACTICE_LEAD_IN_MS,
  PRACTICE_TAIL_MS,
  practiceAudioFileName,
  practiceFileName,
  readDifficultyFile,
  Segment,
} from "../../services/map-practice/osu-practice";

const ACCENT = "#ff66aa";
const PINK_SWITCH = {
  "& .MuiSwitch-switchBase.Mui-checked": { color: ACCENT },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { backgroundColor: ACCENT },
};
const STEP_MS = 1000;

type Job =
  | { state: "idle" }
  | { state: "working" }
  | { state: "done"; file: string }
  | { state: "error"; message: string };

let segmentCounter = 0;
const nextId = () => `seg-${++segmentCounter}`;

function Card({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <Paper elevation={1} sx={{ p: 2.5, borderRadius: 3, boxShadow: "none" }}>
      {title && (
        <Typography variant={"h6"} sx={{ fontWeight: 700, mb: 1.5 }}>
          {title}
        </Typography>
      )}
      {children}
    </Paper>
  );
}

/** The osu! renderer drawing the previewed difficulty, driven by the shared game clock. */
function PreviewCanvas({ path }: { path: string | null }) {
  const { t } = useTranslation();
  const analysisApp = useAnalysisApp();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedRef = useRef<string | null>(null);
  const { status } = useObservable(() => analysisApp.scenarioManager.scenario$, { status: "INIT" });

  useEffect(() => {
    if (canvasRef.current) analysisApp.onEnter(canvasRef.current);
    return () => analysisApp.onHide();
  }, [analysisApp]);

  useEffect(() => {
    if (!path || loadedRef.current === path) return;
    loadedRef.current = path;
    analysisApp.loadBeatmapPreview(path).catch((e) => console.error("Beatmap preview failed", e));
  }, [analysisApp, path]);

  const overlay = status === "LOADING" || status === "ERROR";

  return (
    <Box sx={{ position: "relative", width: "100%", height: 360, borderRadius: 2, overflow: "hidden", bgcolor: "#000" }}>
      <canvas style={{ width: "100%", height: "100%", display: "block" }} ref={canvasRef} />
      {overlay && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        >
          {status === "LOADING" ? <CircularProgress /> : <Typography>{t("canvas.error")}</Typography>}
        </Box>
      )}
    </Box>
  );
}

/** Volume popover (master + music), reusing the shared audio settings. */
function VolumeControl() {
  const { t } = useTranslation();
  const { volume, muted } = useAudioSettings();
  const service = useAudioSettingsService();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const silent = muted || volume.master === 0;

  return (
    <>
      <Tooltip title={t("mp.volume")}>
        <IconButton size={"small"} onClick={(e) => setAnchorEl(e.currentTarget)}>
          {silent ? <VolumeOff /> : <VolumeUp />}
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Box sx={{ p: 2, width: 240 }}>
          <FormControlLabel
            control={<Switch checked={!muted} onChange={() => service.toggleMuted()} sx={PINK_SWITCH} />}
            label={t("mp.sound")}
          />
          <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block", mt: 1 }}>
            {t("settings.masterVolume")}
          </Typography>
          <VolumeSlider value={volume.master} onChange={(x) => service.setMasterVolume(x)} disabled={muted} />
          <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block", mt: 1 }}>
            {t("settings.musicVolume")}
          </Typography>
          <VolumeSlider value={volume.music} onChange={(x) => service.setMusicVolume(x)} disabled={muted} />
        </Box>
      </Popover>
    </>
  );
}

interface TransportProps {
  previewPath: string | null;
  bounds: { min: number; max: number };
  highlights: { startMs: number; endMs: number }[];
  onSetStart: (timeMs: number) => void;
  onSetEnd: (timeMs: number) => void;
}

/** Play/pause, seeking and the "set start/end here" controls, isolated so only it re-renders per frame. */
function Transport({ previewPath, bounds, highlights, onSetStart, onSetEnd }: TransportProps) {
  const { t } = useTranslation();
  const clock = useGameClock();
  const { isPlaying, toggleClock, seekTo, duration } = useGameClockControls();
  const currentTime = useGameClockTime(30);
  const safeDuration = duration > 0 ? duration : 1;

  return (
    <Stack gap={1}>
      <Box sx={{ position: "relative", height: 10 }}>
        {highlights.map((h, i) => (
          <Box
            key={i}
            sx={{
              position: "absolute",
              top: 2,
              height: 6,
              borderRadius: 1,
              backgroundColor: ACCENT,
              opacity: 0.6,
              left: `${(Math.min(h.startMs, safeDuration) / safeDuration) * 100}%`,
              width: `${(Math.max(0, h.endMs - h.startMs) / safeDuration) * 100}%`,
            }}
          />
        ))}
      </Box>
      <Stack direction={"row"} alignItems={"center"} gap={1} flexWrap={"wrap"}>
        <Tooltip title={t("mp.toStart")}>
          <IconButton size={"small"} onClick={() => seekTo(0)}>
            <FirstPage />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("mp.back")}>
          <IconButton size={"small"} onClick={() => seekTo(clock.timeElapsedInMs - STEP_MS)}>
            <FastRewind />
          </IconButton>
        </Tooltip>
        <IconButton onClick={toggleClock}>{isPlaying ? <PauseCircle fontSize={"large"} /> : <PlayCircle fontSize={"large"} />}</IconButton>
        <Tooltip title={t("mp.forward")}>
          <IconButton size={"small"} onClick={() => seekTo(clock.timeElapsedInMs + STEP_MS)}>
            <FastForward />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("mp.toEnd")}>
          <IconButton size={"small"} onClick={() => seekTo(duration)}>
            <LastPage />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1, minWidth: 200, px: 1 }}>
          <Slider
            value={Math.min(currentTime, safeDuration)}
            min={0}
            max={safeDuration}
            step={10}
            onChange={(_, v) => seekTo(v as number)}
            valueLabelDisplay={"auto"}
            valueLabelFormat={formatTime}
            sx={{ color: ACCENT }}
          />
        </Box>
        <Typography sx={{ fontVariantNumeric: "tabular-nums", minWidth: 110, textAlign: "right" }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </Typography>
        <VolumeControl />
      </Stack>
      <Stack direction={"row"} gap={1} flexWrap={"wrap"}>
        <Button
          variant={"outlined"}
          size={"small"}
          disabled={!previewPath}
          onClick={() => onSetStart(Math.max(bounds.min, Math.min(bounds.max, clock.timeElapsedInMs)))}
          sx={{ color: ACCENT, borderColor: ACCENT }}
        >
          {t("mp.setStartHere")}
        </Button>
        <Button
          variant={"outlined"}
          size={"small"}
          disabled={!previewPath}
          onClick={() => onSetEnd(Math.max(bounds.min, Math.min(bounds.max, clock.timeElapsedInMs)))}
          sx={{ color: ACCENT, borderColor: ACCENT }}
        >
          {t("mp.setEndHere")}
        </Button>
      </Stack>
    </Stack>
  );
}

export function MapPractice() {
  const { t } = useTranslation();
  const status = useObservable(() => tosuWatcher.status$, tosuWatcher.status$.getValue());
  const gameMap = useObservable(() => tosuWatcher.map$, tosuWatcher.map$.getValue());

  const [followGame, setFollowGame] = useState(true);
  const [manualPath, setManualPath] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [difficulties, setDifficulties] = useState<DifficultyFile[]>([]);
  const [basePath, setBasePath] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [trimAudio, setTrimAudio] = useState(true);
  const [name, setName] = useState("");
  const [job, setJob] = useState<Job>({ state: "idle" });
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    tosuWatcher.start();
    return () => tosuWatcher.stop();
  }, []);

  const sourcePath = followGame ? gameMap?.path ?? null : manualPath;

  useEffect(() => {
    if (!sourcePath) {
      setDifficulties([]);
      setBasePath(null);
      setFolder(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const dir = dirname(sourcePath);
        const names = (await readdir(dir)).filter((n) => n.toLowerCase().endsWith(".osu"));
        const loaded: DifficultyFile[] = [];
        for (const n of names) {
          const path = join(dir, n);
          try {
            loaded.push(readDifficultyFile(path, await readFile(path, "utf-8")));
          } catch {
            /* skip unreadable difficulty */
          }
        }
        if (cancelled) return;
        loaded.sort((a, b) => a.info.version.localeCompare(b.info.version));
        const base = loaded.find((d) => d.path.toLowerCase() === sourcePath.toLowerCase()) ?? loaded[0];
        const firstSegment = base
          ? { id: nextId(), difficultyPath: base.path, startMs: base.firstObjectMs, endMs: base.lastObjectMs }
          : null;
        setFolder(dir);
        setDifficulties(loaded);
        setBasePath(base?.path ?? null);
        setSegments(firstSegment ? [firstSegment] : []);
        setActiveId(firstSegment?.id ?? null);
        setReadError(null);
        setJob({ state: "idle" });
      } catch (e) {
        if (!cancelled) {
          setDifficulties([]);
          setBasePath(null);
          setReadError((e as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourcePath]);

  const base = useMemo(() => difficulties.find((d) => d.path === basePath) ?? null, [difficulties, basePath]);
  const diffOf = useCallback((path: string) => difficulties.find((d) => d.path === path), [difficulties]);

  const chooseFile = useCallback(async () => {
    const start = folder ?? gameMap?.folder ?? "";
    const file = await frontendAPI.selectFile(start);
    if (file && file.toLowerCase().endsWith(".osu")) {
      setManualPath(file);
      setFollowGame(false);
    }
  }, [folder, gameMap]);

  const updateSegment = (id: string, patch: Partial<Segment>) =>
    setSegments((segs) => segs.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addSegment = () => {
    if (!base) return;
    const seg = { id: nextId(), difficultyPath: base.path, startMs: base.firstObjectMs, endMs: base.lastObjectMs };
    setSegments((segs) => [...segs, seg]);
    setActiveId(seg.id);
  };

  const removeSegment = (id: string) =>
    setSegments((segs) => {
      const next = segs.filter((s) => s.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });

  const activeSegment = segments.find((s) => s.id === activeId) ?? null;
  const previewPath = activeSegment?.difficultyPath ?? base?.path ?? null;
  const previewDiff = previewPath ? diffOf(previewPath) : undefined;
  const previewBounds = { min: previewDiff?.firstObjectMs ?? 0, max: previewDiff?.lastObjectMs ?? 0 };
  const highlights = segments
    .filter((s) => s.difficultyPath === previewPath && s.endMs > s.startMs)
    .map((s) => ({ startMs: s.startMs, endMs: s.endMs }));

  const setActiveStart = (timeMs: number) => {
    if (!activeSegment) return;
    updateSegment(activeSegment.id, { startMs: Math.min(timeMs, activeSegment.endMs) });
  };
  const setActiveEnd = (timeMs: number) => {
    if (!activeSegment) return;
    updateSegment(activeSegment.id, { endMs: Math.max(timeMs, activeSegment.startMs) });
  };

  const sorted = useMemo(() => [...segments].sort((a, b) => a.startMs - b.startMs), [segments]);
  const validSegments = sorted.filter((s) => s.endMs > s.startMs);
  const overlap = validSegments.some((s, i) => i > 0 && s.startMs < validSegments[i - 1].endMs);
  const mixedAudio =
    base != null && segments.some((s) => diffOf(s.difficultyPath)?.info.audioFilename !== base.info.audioFilename);

  const minStart = validSegments.length ? Math.min(...validSegments.map((s) => s.startMs)) : 0;
  const maxEnd = validSegments.length ? Math.max(...validSegments.map((s) => s.endMs)) : 0;
  const audioStartMs = trimAudio ? Math.max(0, minStart - PRACTICE_LEAD_IN_MS) : 0;
  const outputLengthMs = Math.max(0, maxEnd - audioStartMs);

  const defaultName = base ? `${base.info.version} practice` : "";
  const version = name.trim() || defaultName;
  const targetFile = base ? practiceFileName(base.info, version) : "";
  const overwritesOriginal = !!base && !!folder && join(folder, targetFile).toLowerCase() === base.path.toLowerCase();

  const create = useCallback(async () => {
    if (!base || !folder || validSegments.length === 0) return;
    setJob({ state: "working" });
    try {
      const audioName = trimAudio ? practiceAudioFileName(base.info.audioFilename, version) : base.info.audioFilename;
      if (trimAudio) {
        await ipcRenderer.invoke("trimAudio", {
          input: join(folder, base.info.audioFilename),
          output: join(folder, audioName),
          startMs: audioStartMs,
          endMs: maxEnd + PRACTICE_TAIL_MS,
        });
      }
      const output = createPracticeBeatmap({
        baseRaw: base.raw,
        segments: validSegments.map((s) => ({
          raw: (diffOf(s.difficultyPath) ?? base).raw,
          startMs: s.startMs,
          endMs: s.endMs,
        })),
        audioFilename: audioName,
        version,
        audioStartMs,
      });
      const file = join(folder, targetFile);
      await writeFile(file, output, "utf-8");
      setJob({ state: "done", file });
    } catch (e) {
      const message = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      setJob({ state: "error", message });
    }
  }, [base, folder, validSegments, trimAudio, version, audioStartMs, maxEnd, targetFile, diffOf]);

  const statusChip =
    status === "connected" ? (
      <Chip size={"small"} color={"success"} label={t("sc.tosuConnected")} />
    ) : status === "connecting" ? (
      <Chip size={"small"} label={t("sc.tosuConnecting")} />
    ) : (
      <Chip size={"small"} color={"warning"} label={"tosu offline"} />
    );

  return (
    <Box sx={{ height: "100%", overflowY: "auto", p: 2 }}>
      <Stack gap={2} sx={{ maxWidth: 1100, mx: "auto" }}>
        <Paper elevation={1} sx={{ borderRadius: 3, p: 3, boxShadow: "none" }}>
          <Stack direction={"row"} gap={1} alignItems={"center"} flexWrap={"wrap"}>
            {statusChip}
            <FormControlLabel
              sx={{ ml: 1 }}
              control={<Switch checked={followGame} onChange={(e) => setFollowGame(e.target.checked)} sx={PINK_SWITCH} />}
              label={t("sc.followGame")}
            />
            <Box flexGrow={1} />
            <Button variant={"contained"} size={"small"} onClick={chooseFile}>
              {t("sc.chooseFile")}
            </Button>
          </Stack>
          {base ? (
            <Box sx={{ mt: 2 }}>
              <Typography variant={"h5"} sx={{ fontWeight: 800, lineHeight: 1.15 }}>
                {base.info.title}
              </Typography>
              <Typography color={"text.secondary"}>{base.info.artist}</Typography>
              <Stack direction={"row"} gap={1} sx={{ mt: 1 }} flexWrap={"wrap"}>
                <Chip label={t("sc.mappedBy", { creator: base.info.creator })} variant={"outlined"} />
                <Chip label={t("mp.difficultyCount", { count: difficulties.length })} variant={"outlined"} />
              </Stack>
            </Box>
          ) : (
            <Box sx={{ mt: 2 }}>
              <Typography variant={"h6"} sx={{ fontWeight: 700 }}>
                {t("sc.noMap")}
              </Typography>
              <Typography color={"text.secondary"}>
                {status === "offline" && followGame ? t("sc.tosuOffline") : t("sc.waitingGame")}
              </Typography>
              {readError && (
                <Alert severity={"error"} sx={{ mt: 1 }}>
                  {t("sc.readError", { error: readError })}
                </Alert>
              )}
            </Box>
          )}
        </Paper>

        {base && (
          <Card title={t("mp.preview")}>
            <Typography variant={"body2"} color={"text.secondary"} sx={{ mb: 2 }}>
              {t("mp.previewHint", { version: previewDiff?.info.version ?? "" })}
            </Typography>
            <PreviewCanvas path={previewPath} />
            <Box sx={{ mt: 1.5 }}>
              <Transport
                previewPath={previewPath}
                bounds={previewBounds}
                highlights={highlights}
                onSetStart={setActiveStart}
                onSetEnd={setActiveEnd}
              />
            </Box>
          </Card>
        )}

        {base && (
          <Card title={t("mp.segments")}>
            <Typography variant={"body2"} color={"text.secondary"} sx={{ mb: 2 }}>
              {t("mp.segmentsHint")}
            </Typography>
            <Stack gap={1.5}>
              {sorted.map((seg, index) => {
                const diff = diffOf(seg.difficultyPath) ?? base;
                const isActive = seg.id === activeId;
                return (
                  <Box
                    key={seg.id}
                    onClick={() => setActiveId(seg.id)}
                    sx={{
                      p: 1,
                      borderRadius: 2,
                      cursor: "pointer",
                      border: "2px solid",
                      borderColor: isActive ? ACCENT : "transparent",
                      backgroundColor: isActive ? "rgba(255,102,170,0.08)" : "transparent",
                    }}
                  >
                    <Stack direction={"row"} gap={1.5} alignItems={"center"}>
                      <Typography sx={{ fontWeight: 800, color: ACCENT, width: 24 }}>{index + 1}</Typography>
                      <FormControl size={"small"} sx={{ minWidth: 180 }} onClick={(e) => e.stopPropagation()}>
                        <InputLabel>{t("mp.difficulty")}</InputLabel>
                        <Select
                          label={t("mp.difficulty")}
                          value={seg.difficultyPath}
                          onChange={(e) => {
                            const d = diffOf(e.target.value) ?? base;
                            updateSegment(seg.id, {
                              difficultyPath: e.target.value,
                              startMs: Math.max(d.firstObjectMs, Math.min(seg.startMs, d.lastObjectMs)),
                              endMs: Math.min(d.lastObjectMs, Math.max(seg.endMs, d.firstObjectMs)),
                            });
                            setActiveId(seg.id);
                          }}
                        >
                          {difficulties.map((d) => (
                            <MenuItem key={d.path} value={d.path}>
                              {d.info.version}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Box sx={{ flex: 1, px: 1 }} onClick={(e) => e.stopPropagation()}>
                        <Slider
                          value={[seg.startMs, seg.endMs]}
                          min={diff.firstObjectMs}
                          max={diff.lastObjectMs}
                          step={100}
                          disableSwap
                          onChange={(_, v) => {
                            const [s, e] = v as number[];
                            updateSegment(seg.id, { startMs: s, endMs: e });
                          }}
                          valueLabelDisplay={"auto"}
                          valueLabelFormat={formatTime}
                          sx={{ color: ACCENT }}
                        />
                      </Box>
                      <Typography sx={{ fontVariantNumeric: "tabular-nums", width: 110, textAlign: "right" }}>
                        {formatTime(seg.startMs)} – {formatTime(seg.endMs)}
                      </Typography>
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSegment(seg.id);
                        }}
                        disabled={segments.length <= 1}
                        aria-label={t("mp.removeSegment")}
                      >
                        <Delete />
                      </IconButton>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
            <Button startIcon={<Add />} onClick={addSegment} sx={{ mt: 2, color: ACCENT }}>
              {t("mp.addSegment")}
            </Button>
            {overlap && (
              <Alert severity={"warning"} sx={{ mt: 2 }}>
                {t("mp.overlap")}
              </Alert>
            )}
            {mixedAudio && (
              <Alert severity={"warning"} sx={{ mt: 2 }}>
                {t("mp.mixedAudio")}
              </Alert>
            )}
          </Card>
        )}

        {base && (
          <Card>
            <FormControlLabel
              control={<Switch checked={trimAudio} onChange={(e) => setTrimAudio(e.target.checked)} sx={PINK_SWITCH} />}
              label={t("mp.trimAudio")}
            />
            <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block", mb: 2 }}>
              {trimAudio ? t("mp.trimAudioOn", { length: formatTime(outputLengthMs) }) : t("mp.trimAudioOff")}
            </Typography>
            <Stack direction={{ xs: "column", md: "row" }} gap={2} alignItems={{ md: "flex-start" }}>
              <Box sx={{ flex: 1 }}>
                <TextField
                  fullWidth
                  label={t("sc.name")}
                  placeholder={defaultName}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  helperText={
                    name.trim() ? t("sc.fileName", { file: targetFile }) : t("sc.namePlaceholder", { name: defaultName })
                  }
                />
              </Box>
              <Button
                variant={"contained"}
                size={"large"}
                disabled={job.state === "working" || overwritesOriginal || validSegments.length === 0}
                onClick={create}
                startIcon={job.state === "working" ? <CircularProgress size={18} color={"inherit"} /> : undefined}
                sx={{
                  backgroundColor: ACCENT,
                  color: "#15151b",
                  fontWeight: 800,
                  px: 4,
                  height: 56,
                  "&:hover": { backgroundColor: "#e0558f" },
                }}
              >
                {job.state === "working" ? t("sc.creating") : t("mp.create")}
              </Button>
            </Stack>
            {validSegments.length === 0 && (
              <Alert severity={"warning"} sx={{ mt: 2 }}>
                {t("mp.noSegments")}
              </Alert>
            )}
            {overwritesOriginal && (
              <Alert severity={"warning"} sx={{ mt: 2 }}>
                {t("sc.sameAsOriginal")}
              </Alert>
            )}
            {job.state === "done" && (
              <Alert
                severity={"success"}
                sx={{ mt: 2 }}
                action={
                  <Button color={"inherit"} size={"small"} onClick={() => shell.showItemInFolder(job.file)}>
                    {t("sc.openFolder")}
                  </Button>
                }
              >
                {t("sc.created")}
              </Alert>
            )}
            {job.state === "error" && (
              <Alert severity={"error"} sx={{ mt: 2 }}>
                {t("sc.error", { error: job.message })}
              </Alert>
            )}
          </Card>
        )}
      </Stack>
    </Box>
  );
}
