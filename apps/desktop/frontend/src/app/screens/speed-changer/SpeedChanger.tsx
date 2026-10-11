import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Paper,
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Save } from "@mui/icons-material";
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
import {
  applyProfileDifficulty,
  bpmRange,
  createProfile,
  deleteProfile,
  findProfile,
  MAX_RATE,
  MIN_RATE,
  parseProfiles,
  rateForBpm,
  sameProfile,
  SpeedProfile,
  SpeedSetting,
  upsertProfile,
} from "../../services/speed-changer/profiles";

const ACCENT = "#ff66aa";
const PROFILES_KEY = "osucoach-speed-profiles";
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

type SpeedMode = SpeedSetting["mode"];

function loadProfiles(): SpeedProfile[] {
  try {
    return parseProfiles(window.localStorage.getItem(PROFILES_KEY));
  } catch {
    return [];
  }
}

function storeProfiles(profiles: SpeedProfile[]): boolean {
  try {
    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    return true;
  } catch {
    return false;
  }
}

function describeProfile(profile: SpeedProfile): string {
  const speed = profile.speed.mode === "rate" ? formatRate(profile.speed.rate) : `${profile.speed.bpm} BPM`;
  const difficulty = DIFFICULTY_FIELDS.filter(({ key }) => profile.difficulty[key] !== undefined).map(
    ({ key, label }) => `${label} ${profile.difficulty[key]?.toFixed(1)}`,
  );
  return [speed, profile.changePitch ? "pitch" : null, ...difficulty].filter(Boolean).join(" · ");
}

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
  const [speedMode, setSpeedMode] = useState<SpeedMode>("rate");
  const [targetBpm, setTargetBpm] = useState("");
  const [changePitch, setChangePitch] = useState(false);
  const [difficulty, setDifficulty] = useState<DifficultyValues>({ ar: 5, cs: 5, od: 5, hp: 5 });
  const [name, setName] = useState("");
  const [job, setJob] = useState<Job>({ state: "idle" });
  const [profiles, setProfiles] = useState<SpeedProfile[]>(loadProfiles);
  const [saving, setSaving] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [toDelete, setToDelete] = useState<SpeedProfile | null>(null);
  const followedProfile = useRef<SpeedProfile | null>(null);

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
        setDifficulty(
          followedProfile.current
            ? applyProfileDifficulty(followedProfile.current, info.difficulty)
            : { ...info.difficulty },
        );
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

  const mainBpm = map?.info.bpm.main ?? 0;
  const bpmRate = rateForBpm(Number(targetBpm), mainBpm);
  const speed = speedMode === "bpm" ? bpmRate : rate;
  const effectiveRate = speed ?? 1;
  const invalidBpm = speedMode === "bpm" && bpmRate === null;
  const range = bpmRange(mainBpm);

  const manual = () => {
    followedProfile.current = null;
  };

  const changeRate = (next: number) => {
    manual();
    setSpeedMode("rate");
    setRate(next);
    setTargetBpm(String(Math.round(mainBpm * next)));
  };

  const changeBpm = (text: string) => {
    manual();
    setSpeedMode("bpm");
    setTargetBpm(text);
    const next = rateForBpm(Number(text), mainBpm);
    if (next !== null) setRate(next);
  };

  const speedState = useRef({ speedMode, rate, targetBpm });
  speedState.current = { speedMode, rate, targetBpm };

  useEffect(() => {
    if (mainBpm <= 0) return;
    const state = speedState.current;
    if (state.speedMode === "rate") {
      setTargetBpm(String(Math.round(mainBpm * state.rate)));
    } else {
      const next = rateForBpm(Number(state.targetBpm), mainBpm);
      if (next !== null) setRate(next);
    }
  }, [mainBpm]);

  const currentSpeed: SpeedSetting =
    speedMode === "bpm" ? { mode: "bpm", bpm: Number(targetBpm) } : { mode: "rate", rate };
  const current = map ? createProfile("", currentSpeed, changePitch, difficulty, map.info.difficulty) : null;
  const activeProfile = current ? profiles.find((p) => sameProfile(p, current)) : undefined;

  const applyProfile = (profile: SpeedProfile) => {
    if (!map) return;
    if (profile.speed.mode === "rate") {
      setRate(profile.speed.rate);
      setTargetBpm(String(Math.round(mainBpm * profile.speed.rate)));
    } else {
      setTargetBpm(String(profile.speed.bpm));
      const next = rateForBpm(profile.speed.bpm, mainBpm);
      if (next !== null) setRate(next);
    }
    setSpeedMode(profile.speed.mode);
    setChangePitch(profile.changePitch);
    setDifficulty(applyProfileDifficulty(profile, map.info.difficulty));
    followedProfile.current = profile;
  };

  const saveProfile = () => {
    if (!map || !profileName.trim()) return;
    const profile = createProfile(profileName, currentSpeed, changePitch, difficulty, map.info.difficulty);
    const next = upsertProfile(profiles, profile);
    setProfiles(next);
    storeProfiles(next);
    followedProfile.current = profile;
    setSaving(false);
  };

  const removeProfile = (profile: SpeedProfile) => {
    const next = deleteProfile(profiles, profile.name);
    setProfiles(next);
    storeProfiles(next);
    if (followedProfile.current && followedProfile.current.name === profile.name) followedProfile.current = null;
    setToDelete(null);
  };

  const defaultName = useMemo(() => (map ? defaultVersionName(map.info, effectiveRate) : ""), [map, effectiveRate]);
  const version = name.trim() || defaultName;
  const targetFile = map ? osuFileName(map.info, version) : "";
  const overwritesOriginal = !!map && join(map.folder, targetFile).toLowerCase() === map.path.toLowerCase();
  const empty = !!map && map.info.objectCount === 0;

  const create = useCallback(async () => {
    if (!map || speed === null) return;
    const rate = speed;
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
  }, [map, speed, changePitch, difficulty, version, targetFile]);

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
          <Card title={t("sc.profiles")}>
            <Stack direction={"row"} gap={1} flexWrap={"wrap"} alignItems={"center"}>
              {profiles.length === 0 && (
                <Typography variant={"body2"} color={"text.secondary"}>
                  {t("sc.profilesEmpty")}
                </Typography>
              )}
              {profiles.map((p) => {
                const active = activeProfile?.name === p.name;
                return (
                  <Tooltip key={p.name} title={describeProfile(p)}>
                    <Chip
                      label={p.name}
                      onClick={() => applyProfile(p)}
                      onDelete={() => setToDelete(p)}
                      variant={active ? "filled" : "outlined"}
                      sx={active ? { backgroundColor: ACCENT, color: "#15151b", fontWeight: 700 } : { fontWeight: 600 }}
                    />
                  </Tooltip>
                );
              })}
              <Box flexGrow={1} />
              <Button
                startIcon={<Save />}
                disabled={invalidBpm}
                onClick={() => {
                  setProfileName(activeProfile?.name ?? "");
                  setSaving(true);
                }}
              >
                {t("sc.saveProfile")}
              </Button>
            </Stack>
            <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block", mt: 1 }}>
              {t("sc.profileHint")}
            </Typography>
          </Card>
        )}

        {map && (
          <>
            <Stack direction={{ xs: "column", md: "row" }} gap={2}>
              <Box sx={{ flex: 1 }}>
                <Card title={t("sc.speed")}>
                  <Typography variant={"h2"} sx={{ fontWeight: 800, color: ACCENT, lineHeight: 1 }}>
                    {speed === null ? "–" : formatRate(speed)}
                  </Typography>
                  <Slider
                    value={Math.min(MAX_RATE, Math.max(MIN_RATE, rate))}
                    min={MIN_RATE}
                    max={MAX_RATE}
                    step={0.01}
                    onChange={(_, v) => changeRate(v as number)}
                    marks={[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((v) => ({ value: v, label: `${v}x` }))}
                    sx={{ color: ACCENT, mt: 2 }}
                  />
                  <Stack direction={"row"} gap={4} sx={{ mt: 2 }}>
                    <Box>
                      <Typography variant={"caption"} color={"text.secondary"}>
                        {t("sc.bpm")}
                      </Typography>
                      <Stack direction={"row"} alignItems={"center"} gap={1}>
                        <Typography variant={"h6"} sx={{ fontWeight: 700 }}>
                          {Number(mainBpm.toFixed(2))} →
                        </Typography>
                        <TextField
                          type={"number"}
                          size={"small"}
                          value={targetBpm}
                          onChange={(e) => changeBpm(e.target.value)}
                          error={invalidBpm}
                          inputProps={{
                            min: range.min,
                            max: range.max,
                            step: 1,
                            "aria-label": t("sc.newBpm"),
                            style: { fontWeight: 700, fontSize: "1.1rem", width: 72 },
                          }}
                        />
                      </Stack>
                      <Typography
                        variant={"caption"}
                        color={invalidBpm ? "error" : "text.secondary"}
                        sx={{ display: "block", mt: 0.5 }}
                      >
                        {invalidBpm
                          ? t("sc.bpmOutOfRange", { min: range.min, max: range.max })
                          : map.info.bpm.min !== map.info.bpm.max
                          ? t("sc.bpmVariable", { range: formatBpm(map.info, effectiveRate) })
                          : t("sc.newBpm")}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant={"caption"} color={"text.secondary"}>
                        {t("sc.length")}
                      </Typography>
                      <Typography variant={"h6"} sx={{ fontWeight: 700 }}>
                        {formatLength(map.info.lengthMs)} → {formatLength(map.info.lengthMs / effectiveRate)}
                      </Typography>
                    </Box>
                  </Stack>
                  <FormControlLabel
                    sx={{ mt: 1 }}
                    control={
                      <Switch
                        checked={changePitch}
                        onChange={(e) => {
                          manual();
                          setChangePitch(e.target.checked);
                        }}
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
                            onChange={(_, v) => {
                              manual();
                              setDifficulty((d) => ({ ...d, [key]: v as number }));
                            }}
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
                  <Button
                    size={"small"}
                    sx={{ mt: 1 }}
                    onClick={() => {
                      manual();
                      setDifficulty({ ...map.info.difficulty });
                    }}
                  >
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
                  disabled={job.state === "working" || overwritesOriginal || empty || invalidBpm}
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
      <Dialog open={saving} onClose={() => setSaving(false)} fullWidth maxWidth={"xs"}>
        <DialogTitle>{t("sc.saveProfile")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin={"dense"}
            label={t("sc.profileName")}
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveProfile()}
            helperText={
              findProfile(profiles, profileName)
                ? t("sc.profileOverwrite")
                : current
                ? describeProfile({ ...current, name: profileName })
                : " "
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaving(false)}>{t("col.cancel")}</Button>
          <Button
            variant={"contained"}
            onClick={saveProfile}
            disabled={!profileName.trim()}
            sx={{
              backgroundColor: ACCENT,
              color: "#15151b",
              fontWeight: 700,
              "&:hover": { backgroundColor: "#e0558f" },
            }}
          >
            {t("col.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={toDelete !== null} onClose={() => setToDelete(null)}>
        <DialogTitle>{t("sc.deleteProfileTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{toDelete ? t("sc.deleteProfileText", { name: toDelete.name }) : ""}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)}>{t("col.cancel")}</Button>
          <Button variant={"contained"} color={"error"} onClick={() => toDelete && removeProfile(toDelete)}>
            {t("col.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
