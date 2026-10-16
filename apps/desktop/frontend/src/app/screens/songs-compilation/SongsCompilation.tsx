import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  LinearProgress,
  Paper,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add,
  ArrowDownward,
  ArrowUpward,
  Delete,
  GraphicEq,
  OpenInNew,
  RestartAlt,
  Search,
} from "@mui/icons-material";
import { useObservable } from "rxjs-hooks";
import { ipcRenderer, shell } from "electron";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { useTranslation } from "../../i18n";
import { frontendAPI } from "../../api";
import { useAnalysisApp } from "../../providers/TheaterProvider";
import { buildSongLibrary, searchSongs, SongEntry } from "../../services/songs-compilation/library";
import {
  CompSegment,
  estimateDurationMs,
  makeSegment,
  MashupJoin,
  toPlanAndInputs,
} from "../../services/songs-compilation/mashup";
import { WaveformSelector } from "../../components/songs-compilation/WaveformSelector";
import { formatTime } from "../../services/map-practice/osu-practice";
import { mashupQuery$, mashupSegments$, resetMashup, setMashupSegments } from "../../services/songs-compilation/mashup-store";

const ACCENT = "#ff66aa";
const GAP_PRESETS = [0, 500, 1000, 2000];

let counter = 0;
const nextId = () => `comp-${++counter}`;

type Job =
  | { state: "idle" }
  | { state: "working" }
  | { state: "done"; file: string }
  | { state: "error"; message: string };

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

/** The join control shown between two segments: gap presets or a crossfade length. */
function JoinControl({
  join,
  maxCrossfadeMs,
  onChange,
}: {
  join: MashupJoin;
  maxCrossfadeMs: number;
  onChange: (j: MashupJoin) => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack direction={"row"} alignItems={"center"} spacing={2} sx={{ py: 1, pl: 1 }}>
      <ToggleButtonGroup
        size={"small"}
        exclusive
        value={join.type}
        onChange={(_, v) => v && onChange(v === "gap" ? { type: "gap", ms: 0 } : { type: "crossfade", ms: 1000 })}
      >
        <ToggleButton value={"gap"} sx={{ textTransform: "none" }}>
          {t("comp.gap")}
        </ToggleButton>
        <ToggleButton value={"crossfade"} sx={{ textTransform: "none" }}>
          {t("comp.crossfade")}
        </ToggleButton>
      </ToggleButtonGroup>
      {join.type === "gap" ? (
        <Stack direction={"row"} spacing={1}>
          {GAP_PRESETS.map((ms) => (
            <Chip
              key={ms}
              size={"small"}
              label={ms === 0 ? t("comp.noGap") : `${ms / 1000}s`}
              color={join.ms === ms ? "primary" : "default"}
              onClick={() => onChange({ type: "gap", ms })}
              sx={join.ms === ms ? { bgcolor: ACCENT } : undefined}
            />
          ))}
        </Stack>
      ) : (
        <Box sx={{ flex: 1, maxWidth: 260, px: 1 }}>
          <Slider
            size={"small"}
            min={200}
            max={Math.max(400, Math.min(6000, maxCrossfadeMs))}
            step={100}
            value={join.ms}
            valueLabelFormat={(v) => `${(v / 1000).toFixed(1)}s`}
            valueLabelDisplay={"auto"}
            onChange={(_, v) => onChange({ type: "crossfade", ms: v as number })}
            sx={{ color: ACCENT }}
          />
        </Box>
      )}
    </Stack>
  );
}

function SegmentCard({
  seg,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  seg: CompSegment;
  index: number;
  count: number;
  onChange: (patch: Partial<CompSegment>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  return (
    <Paper variant={"outlined"} sx={{ p: 2, borderRadius: 2 }}>
      <Stack direction={"row"} alignItems={"center"} spacing={1} sx={{ mb: 1 }}>
        <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
          {index + 1}. {seg.song.artist} – {seg.song.title}
        </Typography>
        <Tooltip title={t("comp.moveUp")}>
          <span>
            <IconButton size={"small"} disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUpward fontSize={"small"} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("comp.moveDown")}>
          <span>
            <IconButton size={"small"} disabled={index === count - 1} onClick={() => onMove(1)}>
              <ArrowDownward fontSize={"small"} />
            </IconButton>
          </span>
        </Tooltip>
        <IconButton size={"small"} color={"error"} onClick={onRemove}>
          <Delete fontSize={"small"} />
        </IconButton>
      </Stack>

      <WaveformSelector
        src={seg.song.audioPath}
        startMs={seg.startMs}
        endMs={seg.endMs}
        onChange={(startMs, endMs) => onChange({ startMs, endMs })}
        onDuration={(durationMs) =>
          onChange(seg.durationMs === 0 ? { durationMs, endMs: durationMs } : { durationMs })
        }
      />

      <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ mt: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant={"caption"} color={"text.secondary"}>
            {t("comp.rate")}: {seg.rate.toFixed(2)}x
          </Typography>
          <Slider
            size={"small"}
            min={0.5}
            max={2}
            step={0.05}
            value={seg.rate}
            marks={[{ value: 1, label: "1x" }]}
            valueLabelFormat={(v) => `${v}x`}
            valueLabelDisplay={"auto"}
            onChange={(_, v) => onChange({ rate: v as number })}
            sx={{ color: ACCENT }}
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant={"caption"} color={"text.secondary"}>
            {t("comp.fadeIn")}: {(seg.fadeInMs / 1000).toFixed(1)}s
          </Typography>
          <Slider
            size={"small"}
            min={0}
            max={5000}
            step={100}
            value={seg.fadeInMs}
            valueLabelFormat={(v) => `${(v / 1000).toFixed(1)}s`}
            valueLabelDisplay={"auto"}
            onChange={(_, v) => onChange({ fadeInMs: v as number })}
            sx={{ color: ACCENT }}
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant={"caption"} color={"text.secondary"}>
            {t("comp.fadeOut")}: {(seg.fadeOutMs / 1000).toFixed(1)}s
          </Typography>
          <Slider
            size={"small"}
            min={0}
            max={5000}
            step={100}
            value={seg.fadeOutMs}
            valueLabelFormat={(v) => `${(v / 1000).toFixed(1)}s`}
            valueLabelDisplay={"auto"}
            onChange={(_, v) => onChange({ fadeOutMs: v as number })}
            sx={{ color: ACCENT }}
          />
        </Box>
      </Stack>
    </Paper>
  );
}

export function SongsCompilation() {
  const { t } = useTranslation();
  const analyzer = useAnalysisApp();
  const songsFolder = useObservable(
    () => analyzer.osuFolderService.songsFolder$,
    analyzer.osuFolderService.songsFolder$.getValue(),
  );

  const [library, setLibrary] = useState<SongEntry[]>([]);
  const [libError, setLibError] = useState<string | null>(null);
  const [loadingLib, setLoadingLib] = useState(true);
  // Query and segments live in a module store so they survive leaving and re-opening the tab.
  const query = useObservable(() => mashupQuery$, mashupQuery$.getValue());
  const setQuery = (v: string) => mashupQuery$.next(v);
  const segments = useObservable(() => mashupSegments$, mashupSegments$.getValue());
  const setSegments = setMashupSegments;
  const [job, setJob] = useState<Job>({ state: "idle" });
  const [progress, setProgress] = useState<{ value: number; elapsedMs: number } | null>(null);

  useEffect(() => {
    if (!songsFolder) return;
    let cancelled = false;
    setLoadingLib(true);
    (async () => {
      try {
        const bps = await analyzer.osuDBDao.getAllBlueprints();
        if (cancelled) return;
        setLibrary(buildSongLibrary(bps, songsFolder));
        setLibError(null);
      } catch (e) {
        if (!cancelled) setLibError((e as Error).message);
      } finally {
        if (!cancelled) setLoadingLib(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analyzer, songsFolder]);

  const results = useMemo(() => searchSongs(library, query, 200), [library, query]);
  const totalMs = useMemo(() => estimateDurationMs(segments), [segments]);

  const addSong = (song: SongEntry) => {
    if (!existsSync(song.audioPath)) {
      setJob({ state: "error", message: t("comp.audioMissing", { file: song.audioFileName }) });
      return;
    }
    setSegments((s) => [...s, makeSegment(nextId(), song, 0)]);
  };
  const patchSegment = (id: string, patch: Partial<CompSegment>) =>
    setSegments((s) => s.map((seg) => (seg.id === id ? { ...seg, ...patch } : seg)));
  const removeSegment = (id: string) => setSegments((s) => s.filter((seg) => seg.id !== id));
  const moveSegment = (id: string, dir: -1 | 1) =>
    setSegments((s) => {
      const i = s.findIndex((seg) => seg.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const setJoin = (id: string, join: MashupJoin) => patchSegment(id, { joinAfter: join });

  const create = useCallback(async () => {
    if (segments.length === 0) return;
    const firstFolder = dirname(segments[0].song.audioPath);
    const defaultOut = join(firstFolder || songsFolder || "", "compilation.mp3");
    const output = await frontendAPI.selectSaveFile(defaultOut);
    if (!output) return;
    setJob({ state: "working" });
    setProgress({ value: 0, elapsedMs: 0 });
    const onProg = (_e: unknown, p: { value: number; elapsedMs: number }) => setProgress(p);
    ipcRenderer.on("mashupProgress", onProg);
    try {
      const { inputs, plan } = toPlanAndInputs(segments);
      await ipcRenderer.invoke("compileMashup", { inputs, plan, output });
      setJob({ state: "done", file: output });
    } catch (e) {
      const message = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      setJob({ state: "error", message });
    } finally {
      ipcRenderer.removeListener("mashupProgress", onProg);
      setProgress(null);
    }
  }, [segments, songsFolder]);

  return (
    <Box sx={{ height: "100%", overflowY: "auto", p: 2 }}>
      <Stack gap={2} sx={{ maxWidth: 1100, mx: "auto" }}>
        <Card>
          <Stack direction={"row"} alignItems={"center"} spacing={1.5}>
            <GraphicEq sx={{ color: ACCENT }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant={"h6"} sx={{ fontWeight: 800 }}>
                {t("comp.title")}
              </Typography>
              <Typography variant={"body2"} color={"text.secondary"}>
                {t("comp.subtitle")}
              </Typography>
            </Box>
            <Button
              startIcon={<RestartAlt />}
              color={"inherit"}
              disabled={(segments.length === 0 && !query) || job.state === "working"}
              onClick={() => {
                resetMashup();
                setJob({ state: "idle" });
              }}
              sx={{ textTransform: "none" }}
            >
              {t("comp.reset")}
            </Button>
          </Stack>
        </Card>

        <Card title={t("comp.library")}>
          <TextField
            fullWidth
            size={"small"}
            placeholder={t("comp.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position={"start"}>
                  <Search fontSize={"small"} />
                </InputAdornment>
              ),
            }}
          />
          {loadingLib ? (
            <Stack alignItems={"center"} sx={{ py: 3 }}>
              <CircularProgress size={24} sx={{ color: ACCENT }} />
            </Stack>
          ) : libError ? (
            <Alert severity={"error"} sx={{ mt: 2 }}>
              {libError}
            </Alert>
          ) : (
            <Box sx={{ mt: 1.5, maxHeight: 260, overflowY: "auto" }}>
              {results.length === 0 ? (
                <Typography variant={"body2"} color={"text.secondary"} sx={{ p: 1 }}>
                  {t("comp.noResults")}
                </Typography>
              ) : (
                results.map((song) => (
                  <Stack
                    key={song.key}
                    direction={"row"}
                    alignItems={"center"}
                    spacing={1}
                    sx={{ px: 1, py: 0.5, borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontWeight: 600 }}>
                        {song.title}
                      </Typography>
                      <Typography variant={"caption"} color={"text.secondary"} noWrap>
                        {song.artist}
                      </Typography>
                    </Box>
                    <Button size={"small"} startIcon={<Add />} onClick={() => addSong(song)} sx={{ color: ACCENT }}>
                      {t("comp.add")}
                    </Button>
                  </Stack>
                ))
              )}
            </Box>
          )}
        </Card>

        <Card title={t("comp.segments")}>
          {segments.length === 0 ? (
            <Typography variant={"body2"} color={"text.secondary"}>
              {t("comp.emptyHint")}
            </Typography>
          ) : (
            <Stack spacing={1}>
              {segments.map((seg, i) => (
                <Box key={seg.id}>
                  <SegmentCard
                    seg={seg}
                    index={i}
                    count={segments.length}
                    onChange={(patch) => patchSegment(seg.id, patch)}
                    onRemove={() => removeSegment(seg.id)}
                    onMove={(dir) => moveSegment(seg.id, dir)}
                  />
                  {i < segments.length - 1 && (
                    <JoinControl
                      join={seg.joinAfter}
                      maxCrossfadeMs={Math.min(seg.endMs - seg.startMs, segments[i + 1].endMs - segments[i + 1].startMs)}
                      onChange={(j) => setJoin(seg.id, j)}
                    />
                  )}
                </Box>
              ))}
            </Stack>
          )}
        </Card>

        <Card>
          <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} spacing={2}>
            <Box sx={{ flex: 1 }}>
              <Typography variant={"body2"} color={"text.secondary"}>
                {t("comp.total")}
              </Typography>
              <Typography variant={"h6"} sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                {formatTime(totalMs)}
              </Typography>
            </Box>
            <Button
              variant={"contained"}
              disabled={segments.length === 0 || job.state === "working"}
              onClick={() => void create()}
              sx={{ bgcolor: ACCENT, "&:hover": { bgcolor: "#ff4d99" }, fontWeight: 700, px: 3 }}
            >
              {job.state === "working" ? <CircularProgress size={22} color={"inherit"} /> : t("comp.create")}
            </Button>
          </Stack>
          {job.state === "working" && progress && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress variant={"determinate"} value={progress.value * 100} sx={{ height: 8, borderRadius: 1 }} />
              <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block", mt: 0.5 }}>
                {Math.round(progress.value * 100)}%
                {progress.value > 0.01 &&
                  ` · ${t("comp.timeLeft", {
                    time: formatTime((progress.elapsedMs * (1 - progress.value)) / progress.value),
                  })}`}
              </Typography>
            </Box>
          )}
          {job.state === "done" && (
            <Alert
              severity={"success"}
              sx={{ mt: 2 }}
              action={
                <Button
                  size={"small"}
                  startIcon={<OpenInNew />}
                  onClick={() => void shell.showItemInFolder(job.file)}
                >
                  {t("comp.reveal")}
                </Button>
              }
            >
              {t("comp.done", { file: job.file })}
            </Alert>
          )}
          {job.state === "error" && (
            <Alert severity={"error"} sx={{ mt: 2 }}>
              {job.message}
            </Alert>
          )}
        </Card>
      </Stack>
    </Box>
  );
}
