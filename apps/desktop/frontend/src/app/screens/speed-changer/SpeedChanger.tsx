import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Paper,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useObservable } from "rxjs-hooks";
import { ipcRenderer, shell } from "electron";
import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { pathToFileURL } from "url";
import { useTranslation } from "../../i18n";
import { tosuWatcher } from "../../services/speed-changer/tosu";
import {
  BeatmapInfo,
  createRateChangedBeatmap,
  defaultVersionName,
  DifficultyValues,
  formatRate,
  osuFileName,
  rateAudioFileName,
  readBeatmapInfo,
} from "../../services/speed-changer/osu-rate";
import { frontendAPI } from "../../api";

const ACCENT = "#ff66aa";
const MIN_RATE = 0.5;
const MAX_RATE = 2.0;
const PINK_SWITCH = {
  "& .MuiSwitch-switchBase.Mui-checked": { color: ACCENT },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { backgroundColor: ACCENT },
};

interface LoadedMap {
  path: string;
  folder: string;
  raw: string;
  info: BeatmapInfo;
}

type Job =
  | { state: "idle" }
  | { state: "working" }
  | { state: "done"; file: string }
  | { state: "error"; message: string };

function formatLength(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatBpm(info: BeatmapInfo, rate: number) {
  const { min, max, main } = info.bpm;
  const r = (b: number) => Math.round(b * rate);
  return min !== max ? `${r(min)}-${r(max)} (${r(main)})` : `${r(main)}`;
}

const DIFFICULTY_FIELDS: { key: keyof DifficultyValues; label: string }[] = [
  { key: "ar", label: "AR" },
  { key: "cs", label: "CS" },
  { key: "od", label: "OD" },
  { key: "hp", label: "HP" },
];

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

export function SpeedChanger() {
  const { t } = useTranslation();
  const status = useObservable(() => tosuWatcher.status$, tosuWatcher.status$.getValue());
  const gameMap = useObservable(() => tosuWatcher.map$, tosuWatcher.map$.getValue());

  const [followGame, setFollowGame] = useState(true);
  const [manualPath, setManualPath] = useState<string | null>(null);
  const [map, setMap] = useState<LoadedMap | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const [rate, setRate] = useState(1.2);
  const [changePitch, setChangePitch] = useState(false);
  const [difficulty, setDifficulty] = useState<DifficultyValues>({ ar: 5, cs: 5, od: 5, hp: 5 });
  const [name, setName] = useState("");
  const [job, setJob] = useState<Job>({ state: "idle" });

  useEffect(() => {
    tosuWatcher.start();
    return () => tosuWatcher.stop();
  }, []);

  const sourcePath = followGame ? gameMap?.path ?? null : manualPath;

  useEffect(() => {
    if (!sourcePath) {
      setMap(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await readFile(sourcePath, "utf-8");
        if (cancelled) return;
        const info = readBeatmapInfo(raw);
        setMap({ path: sourcePath, folder: dirname(sourcePath), raw, info });
        setDifficulty({ ...info.difficulty });
        setReadError(null);
        setJob({ state: "idle" });
      } catch (e) {
        if (!cancelled) {
          setMap(null);
          setReadError((e as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourcePath]);

  const chooseFile = useCallback(async () => {
    const start = map?.folder ?? gameMap?.folder ?? "";
    const file = await frontendAPI.selectFile(start);
    if (file && file.toLowerCase().endsWith(".osu")) {
      setManualPath(file);
      setFollowGame(false);
    }
  }, [map, gameMap]);

  const defaultName = useMemo(() => (map ? defaultVersionName(map.info, rate) : ""), [map, rate]);
  const version = name.trim() || defaultName;
  const targetFile = map ? osuFileName(map.info, version) : "";
  const overwritesOriginal = !!map && join(map.folder, targetFile).toLowerCase() === map.path.toLowerCase();
  const empty = !!map && map.info.objectCount === 0;

  const create = useCallback(async () => {
    if (!map) return;
    setJob({ state: "working" });
    try {
      const sameSpeed = Math.abs(rate - 1) < 1e-6 && !changePitch;
      const audioName = sameSpeed
        ? map.info.audioFilename
        : rateAudioFileName(map.info.audioFilename, rate, changePitch);
      if (!sameSpeed) {
        await ipcRenderer.invoke("speedChangeAudio", {
          input: join(map.folder, map.info.audioFilename),
          output: join(map.folder, audioName),
          rate,
          changePitch,
        });
      }
      const output = createRateChangedBeatmap(map.raw, { rate, difficulty, version, audioFilename: audioName });
      const file = join(map.folder, targetFile);
      await writeFile(file, output, "utf-8");
      setJob({ state: "done", file });
    } catch (e) {
      const message = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      setJob({ state: "error", message });
    }
  }, [map, rate, changePitch, difficulty, version, targetFile]);

  const backgroundUrl =
    map?.info.backgroundFile && existsSync(join(map.folder, map.info.backgroundFile))
      ? pathToFileURL(join(map.folder, map.info.backgroundFile)).href
      : undefined;

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
        <Paper
          elevation={1}
          sx={{
            borderRadius: 3,
            overflow: "hidden",
            position: "relative",
            minHeight: 170,
            boxShadow: "none",
            backgroundImage: backgroundUrl
              ? `linear-gradient(90deg, rgba(18,18,24,0.95) 0%, rgba(18,18,24,0.7) 55%, rgba(18,18,24,0.35) 100%), url("${backgroundUrl}")`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <Stack sx={{ p: 3 }} gap={1.5}>
            <Stack direction={"row"} gap={1} alignItems={"center"} flexWrap={"wrap"}>
              {statusChip}
              <FormControlLabel
                sx={{ ml: 1 }}
                control={
                  <Switch checked={followGame} onChange={(e) => setFollowGame(e.target.checked)} sx={PINK_SWITCH} />
                }
                label={t("sc.followGame")}
              />
              <Box flexGrow={1} />
              <Button
                variant={"contained"}
                size={"small"}
                onClick={chooseFile}
                sx={{
                  backgroundColor: "rgba(18,18,24,0.85)",
                  color: "text.primary",
                  "&:hover": { backgroundColor: "rgba(40,40,50,0.95)" },
                }}
              >
                {t("sc.chooseFile")}
              </Button>
            </Stack>

            {map ? (
              <Box>
                <Typography variant={"h4"} sx={{ fontWeight: 800, lineHeight: 1.15 }}>
                  {map.info.title}
                </Typography>
                <Typography variant={"h6"} color={"text.secondary"}>
                  {map.info.artist}
                </Typography>
                <Stack direction={"row"} gap={1} sx={{ mt: 1 }} flexWrap={"wrap"}>
                  <Chip
                    label={`[${map.info.version}]`}
                    sx={{ backgroundColor: ACCENT, color: "#15151b", fontWeight: 700 }}
                  />
                  <Chip label={t("sc.mappedBy", { creator: map.info.creator })} variant={"outlined"} />
                  <Chip label={`${formatBpm(map.info, 1)} BPM`} variant={"outlined"} />
                  <Chip label={formatLength(map.info.lengthMs)} variant={"outlined"} />
                </Stack>
              </Box>
            ) : (
              <Box sx={{ py: 2 }}>
                <Typography variant={"h5"} sx={{ fontWeight: 700 }}>
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
          </Stack>
        </Paper>

        {map && (
          <>
            <Stack direction={{ xs: "column", md: "row" }} gap={2}>
              <Box sx={{ flex: 1 }}>
                <Card title={t("sc.speed")}>
                  <Typography variant={"h2"} sx={{ fontWeight: 800, color: ACCENT, lineHeight: 1 }}>
                    {formatRate(rate)}
                  </Typography>
                  <Slider
                    value={rate}
                    min={MIN_RATE}
                    max={MAX_RATE}
                    step={0.05}
                    onChange={(_, v) => setRate(v as number)}
                    marks={[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((v) => ({ value: v, label: `${v}x` }))}
                    sx={{ color: ACCENT, mt: 2 }}
                  />
                  <Stack direction={"row"} gap={4} sx={{ mt: 2 }}>
                    <Box>
                      <Typography variant={"caption"} color={"text.secondary"}>
                        {t("sc.bpm")}
                      </Typography>
                      <Typography variant={"h6"} sx={{ fontWeight: 700 }}>
                        {formatBpm(map.info, 1)} → {formatBpm(map.info, rate)}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant={"caption"} color={"text.secondary"}>
                        {t("sc.length")}
                      </Typography>
                      <Typography variant={"h6"} sx={{ fontWeight: 700 }}>
                        {formatLength(map.info.lengthMs)} → {formatLength(map.info.lengthMs / rate)}
                      </Typography>
                    </Box>
                  </Stack>
                  <FormControlLabel
                    sx={{ mt: 1 }}
                    control={
                      <Switch
                        checked={changePitch}
                        onChange={(e) => setChangePitch(e.target.checked)}
                        sx={PINK_SWITCH}
                      />
                    }
                    label={t("sc.changePitch")}
                  />
                </Card>
              </Box>

              <Box sx={{ flex: 1 }}>
                <Card title={t("sc.difficulty")}>
                  <Stack gap={0.5}>
                    {DIFFICULTY_FIELDS.map(({ key, label }) => {
                      const original = map.info.difficulty[key];
                      const changed = Math.abs(difficulty[key] - original) > 1e-6;
                      return (
                        <Stack key={key} direction={"row"} alignItems={"center"} gap={2}>
                          <Typography sx={{ width: 32, fontWeight: 700 }}>{label}</Typography>
                          <Slider
                            value={difficulty[key]}
                            min={0}
                            max={10}
                            step={0.1}
                            onChange={(_, v) => setDifficulty((d) => ({ ...d, [key]: v as number }))}
                            marks={[{ value: original }]}
                            sx={{ color: changed ? ACCENT : undefined }}
                          />
                          <Box sx={{ width: 96, textAlign: "right" }}>
                            <Typography sx={{ fontWeight: 700, color: changed ? ACCENT : undefined }}>
                              {difficulty[key].toFixed(1)}
                            </Typography>
                            <Typography variant={"caption"} color={"text.secondary"}>
                              {t("sc.original", { value: original })}
                            </Typography>
                          </Box>
                        </Stack>
                      );
                    })}
                  </Stack>
                  <Button size={"small"} sx={{ mt: 1 }} onClick={() => setDifficulty({ ...map.info.difficulty })}>
                    {t("sc.resetDifficulty")}
                  </Button>
                </Card>
              </Box>
            </Stack>

            <Card>
              <Stack direction={{ xs: "column", md: "row" }} gap={2} alignItems={{ md: "flex-start" }}>
                <Box sx={{ flex: 1 }}>
                  <TextField
                    fullWidth
                    label={t("sc.name")}
                    placeholder={defaultName}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    helperText={
                      name.trim()
                        ? t("sc.fileName", { file: targetFile })
                        : t("sc.namePlaceholder", { name: defaultName })
                    }
                  />
                </Box>
                <Button
                  variant={"contained"}
                  size={"large"}
                  disabled={job.state === "working" || overwritesOriginal || empty}
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
                  {job.state === "working" ? t("sc.creating") : t("sc.create")}
                </Button>
              </Stack>
              {empty && (
                <Alert severity={"warning"} sx={{ mt: 2 }}>
                  {t("sc.noObjects")}
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
          </>
        )}
      </Stack>
    </Box>
  );
}
