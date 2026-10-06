import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { ExpandLess, ExpandMore, FolderOpen } from "@mui/icons-material";
import { useObservable } from "rxjs-hooks";
import { shell } from "electron";
import { join, relative } from "path";
import { TranslationKey, useTranslation } from "../../i18n";
import { useTheaterContext } from "../../providers/TheaterProvider";
import { frontendAPI } from "../../api";
import { isOsuRunning } from "../../services/common/local/osu-process";
import { BackupFile, backupFolder, listBackups } from "../../services/common/local/osu-backup";
import { restoreBackup } from "../../services/map-cleaner/restore-backup";
import { collectionStore } from "../../services/collections/collection-store";
import { CLEAN_CATEGORIES, CleanCategory } from "../../services/map-cleaner/cleaner-rules";
import { LoadedScores, loadLocalScores, removePlayersScores } from "../../services/map-cleaner/local-scores";
import {
  CLEANED_FOLDER,
  FoundFile,
  isLinkedFolder,
  mapCleaner,
  moveSongsFolder,
  Progress,
  RemovalMethod,
  RemovalResult,
  removeFiles,
  ReplayGroup,
  replayFilesWithExtras,
  scanReplays,
} from "../../services/map-cleaner/map-cleaner";

const ACCENT = "#ff66aa";
const PAGE_SIZE = 100;
const PINK = { color: ACCENT, "&.Mui-checked": { color: ACCENT } };
const PINK_BUTTON = {
  backgroundColor: ACCENT,
  color: "#15151b",
  fontWeight: 700,
  "&:hover": { backgroundColor: "#ff85bb" },
};

const CATEGORY_LABELS: Record<CleanCategory, TranslationKey> = {
  videos: "mc.cat.videos",
  storyboard: "mc.cat.storyboard",
  skin: "mc.cat.skin",
  hitsounds: "mc.cat.hitsounds",
  backgrounds: "mc.cat.backgrounds",
  modeStd: "mc.cat.modeStd",
  modeTaiko: "mc.cat.modeTaiko",
  modeCatch: "mc.cat.modeCatch",
  modeMania: "mc.cat.modeMania",
  junk: "mc.cat.junk",
  uncommon: "mc.cat.uncommon",
};
const METHOD_LABELS: Record<RemovalMethod, TranslationKey> = {
  trash: "mc.method.trash",
  move: "mc.method.move",
  delete: "mc.method.delete",
};

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unit]}`;
}

const totalSize = (files: FoundFile[]) => files.reduce((sum, f) => sum + f.size, 0);

function Card({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <Paper elevation={1} sx={{ p: 2.5, borderRadius: 3, boxShadow: "none" }}>
      <Typography variant={"h6"} sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {intro && (
        <Typography variant={"body2"} color={"text.secondary"} sx={{ mt: 0.5, mb: 2 }}>
          {intro}
        </Typography>
      )}
      {children}
    </Paper>
  );
}

function ProgressBar({ progress, label }: { progress: Progress; label: string }) {
  const value = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  return (
    <Stack gap={0.5} sx={{ flex: 1 }}>
      <Typography variant={"body2"} color={"text.secondary"}>
        {label}
      </Typography>
      <LinearProgress
        variant={progress.total > 0 ? "determinate" : "indeterminate"}
        value={value}
        sx={{ "& .MuiLinearProgress-bar": { backgroundColor: ACCENT } }}
      />
    </Stack>
  );
}

function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  danger,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{text}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("mc.cancel")}</Button>
        <Button onClick={onConfirm} variant={"contained"} color={danger ? "error" : "primary"}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type DoneRemoval = RemovalResult & { method: RemovalMethod };

const FREED_KEYS: Record<RemovalMethod, TranslationKey> = {
  delete: "mc.freed.delete",
  trash: "mc.freed.trash",
  move: "mc.freed.move",
};

function removalText(t: ReturnType<typeof useTranslation>["t"], result: DoneRemoval) {
  const text = t(FREED_KEYS[result.method], { count: result.removed.length, size: formatSize(result.bytes) });
  return result.failed.length > 0 ? `${text} ${t("mc.failedSuffix", { failed: result.failed.length })}` : text;
}

function RemovalAlert({ result, onClose }: { result: DoneRemoval; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert severity={result.failed.length > 0 ? "warning" : "success"} onClose={onClose}>
      {removalText(t, result)}
    </Alert>
  );
}

function useOsuRunning() {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const check = () => void isOsuRunning().then(setRunning);
    check();
    const timer = setInterval(check, 3000);
    return () => clearInterval(timer);
  }, []);
  return running;
}

function OsuOpenAlert({ show }: { show: boolean }) {
  const { t } = useTranslation();
  return show ? <Alert severity={"error"}>{t("mc.osuBlocked")}</Alert> : null;
}

function useOsuGuard(osuRunning: boolean) {
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    if (!refused) return;
    const timer = setTimeout(() => setRefused(false), 5000);
    return () => clearTimeout(timer);
  }, [refused]);
  const ensureClosed = async () => {
    if (await isOsuRunning()) {
      setRefused(true);
      return false;
    }
    return true;
  };
  return { blocked: osuRunning || refused, ensureClosed };
}

function CategoryFiles({
  files,
  songsFolder,
  excluded,
  onToggle,
}: {
  files: FoundFile[];
  songsFolder: string;
  excluded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(PAGE_SIZE);
  return (
    <Box sx={{ ml: 4, mb: 1, maxHeight: 360, overflowY: "auto", borderLeft: 2, borderColor: "divider", pl: 1 }}>
      {files.slice(0, visible).map((f) => (
        <Stack key={f.path} direction={"row"} alignItems={"center"} gap={1}>
          <Checkbox size={"small"} checked={!excluded.has(f.path)} onChange={() => onToggle(f.path)} sx={PINK} />
          <Typography variant={"body2"} noWrap sx={{ flex: 1, minWidth: 0 }} title={f.path}>
            {relative(songsFolder, f.path)}
          </Typography>
          <Typography variant={"caption"} color={"text.secondary"} sx={{ flexShrink: 0 }}>
            {formatSize(f.size)}
          </Typography>
          <Tooltip title={t("mc.openFolder")}>
            <IconButton size={"small"} onClick={() => shell.showItemInFolder(f.path)}>
              <FolderOpen fontSize={"small"} />
            </IconButton>
          </Tooltip>
        </Stack>
      ))}
      {files.length > visible && (
        <Button size={"small"} onClick={() => setVisible((v) => v + PAGE_SIZE)}>
          {t("mc.showMore")}
        </Button>
      )}
    </Box>
  );
}

function CleanSection({
  osuFolder,
  songsFolder,
  osuRunning,
}: {
  osuFolder: string;
  songsFolder: string;
  osuRunning: boolean;
}) {
  const { t } = useTranslation();
  const scan = useObservable(() => mapCleaner.scan$, mapCleaner.scan$.getValue());
  const [selected, setSelected] = useState<Set<CleanCategory>>(new Set());
  const [expanded, setExpanded] = useState<CleanCategory | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<RemovalMethod>("trash");
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState<Progress | null>(null);
  const [result, setResult] = useState<DoneRemoval | null>(null);
  const guard = useOsuGuard(osuRunning);

  const byCategory = useMemo(() => {
    const groups = new Map<CleanCategory, FoundFile[]>(CLEAN_CATEGORIES.map((c) => [c, []]));
    scan.files.forEach((f) => groups.get(f.category)?.push(f));
    return groups;
  }, [scan.files]);

  const toRemove = useMemo(
    () => scan.files.filter((f) => selected.has(f.category) && !excluded.has(f.path)),
    [scan.files, selected, excluded],
  );
  const toRemoveSize = totalSize(toRemove);

  const toggleCategory = (c: CleanCategory) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  const toggleFile = (path: string) =>
    setExcluded((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const startScan = () => {
    setResult(null);
    setExcluded(new Set());
    void mapCleaner.startScan(songsFolder);
  };

  const remove = async () => {
    setConfirming(false);
    setResult(null);
    if (!(await guard.ensureClosed())) return;
    const paths = toRemove.map((f) => f.path);
    setRemoving({ done: 0, total: paths.length });
    const r = await removeFiles(paths, method, { osuFolder, baseFolder: songsFolder, onProgress: setRemoving });
    mapCleaner.forgetRemoved(r.removed);
    setRemoving(null);
    setResult({ ...r, method });
  };

  const confirmText =
    method === "trash"
      ? t("mc.confirmTrash", { size: formatSize(toRemoveSize) })
      : method === "move"
      ? t("mc.confirmMove", { folder: join(osuFolder, CLEANED_FOLDER), size: formatSize(toRemoveSize) })
      : t("mc.confirmDelete", { size: formatSize(toRemoveSize) });

  return (
    <Card title={t("mc.cleanTitle")} intro={t("mc.cleanIntro")}>
      <Stack gap={2}>
        <OsuOpenAlert show={guard.blocked} />

        <Stack direction={"row"} gap={2} alignItems={"center"}>
          {scan.status === "scanning" ? (
            <>
              <ProgressBar
                progress={scan.progress}
                label={t("mc.scanning", { done: scan.progress.done, total: scan.progress.total })}
              />
              <Button onClick={() => mapCleaner.cancelScan()}>{t("mc.cancel")}</Button>
            </>
          ) : (
            <Button variant={"contained"} onClick={startScan} disabled={removing !== null} sx={PINK_BUTTON}>
              {t(scan.status === "done" ? "mc.rescan" : "mc.scan")}
            </Button>
          )}
        </Stack>
        {scan.status === "error" && <Alert severity={"error"}>{t("mc.scanError", { error: scan.error ?? "" })}</Alert>}

        {scan.status === "done" && (
          <>
            <Stack direction={"row"} alignItems={"center"}>
              <Typography sx={{ fontWeight: 700, flex: 1 }}>{t("mc.chooseWhat")}</Typography>
              <Button size={"small"} onClick={() => setSelected(new Set(CLEAN_CATEGORIES))}>
                {t("mc.selectAll")}
              </Button>
              <Button size={"small"} onClick={() => setSelected(new Set())}>
                {t("mc.selectNone")}
              </Button>
            </Stack>
            <Box>
              {CLEAN_CATEGORIES.map((c) => {
                const files = byCategory.get(c) ?? [];
                const open = expanded === c;
                return (
                  <Box key={c}>
                    <Stack direction={"row"} alignItems={"center"}>
                      <FormControlLabel
                        sx={{ flex: 1 }}
                        disabled={files.length === 0}
                        control={<Checkbox checked={selected.has(c)} onChange={() => toggleCategory(c)} sx={PINK} />}
                        label={t(CATEGORY_LABELS[c])}
                      />
                      <Typography variant={"body2"} color={"text.secondary"}>
                        {t("mc.catInfo", { count: files.length, size: formatSize(totalSize(files)) })}
                      </Typography>
                      <IconButton
                        size={"small"}
                        disabled={files.length === 0}
                        onClick={() => setExpanded(open ? null : c)}
                      >
                        {open ? <ExpandLess /> : <ExpandMore />}
                      </IconButton>
                    </Stack>
                    <Collapse in={open} unmountOnExit>
                      <CategoryFiles
                        files={files}
                        songsFolder={songsFolder}
                        excluded={excluded}
                        onToggle={toggleFile}
                      />
                    </Collapse>
                  </Box>
                );
              })}
            </Box>

            <Box>
              <Typography sx={{ fontWeight: 700 }}>{t("mc.method")}</Typography>
              <RadioGroup row value={method} onChange={(e) => setMethod(e.target.value as RemovalMethod)}>
                {(Object.keys(METHOD_LABELS) as RemovalMethod[]).map((m) => (
                  <FormControlLabel key={m} value={m} control={<Radio sx={PINK} />} label={t(METHOD_LABELS[m])} />
                ))}
              </RadioGroup>
            </Box>

            <Stack direction={"row"} gap={2} alignItems={"center"} flexWrap={"wrap"}>
              {removing ? (
                <ProgressBar
                  progress={removing}
                  label={t("mc.removing", { done: removing.done, total: removing.total })}
                />
              ) : (
                <>
                  <Typography sx={{ flex: 1 }}>
                    {t("mc.selected", { count: toRemove.length, size: formatSize(toRemoveSize) })}
                  </Typography>
                  {method === "move" && (
                    <Button onClick={() => void shell.openPath(join(osuFolder, CLEANED_FOLDER))}>
                      {t("mc.openCleaned")}
                    </Button>
                  )}
                  <Button
                    variant={"contained"}
                    color={method === "delete" ? "error" : "primary"}
                    disabled={toRemove.length === 0 || guard.blocked}
                    onClick={() => setConfirming(true)}
                    sx={method === "delete" ? { fontWeight: 700 } : PINK_BUTTON}
                  >
                    {t("mc.remove")}
                  </Button>
                </>
              )}
            </Stack>
            {result && <RemovalAlert result={result} onClose={() => setResult(null)} />}
          </>
        )}
      </Stack>
      <ConfirmDialog
        open={confirming}
        title={t("mc.confirmTitle", { count: toRemove.length })}
        text={confirmText}
        confirmLabel={t("mc.confirm")}
        danger={method === "delete"}
        onClose={() => setConfirming(false)}
        onConfirm={() => void remove()}
      />
    </Card>
  );
}

function BackgroundsSection({ osuRunning }: { osuRunning: boolean }) {
  const { t } = useTranslation();
  const guard = useOsuGuard(osuRunning);
  const scan = useObservable(() => mapCleaner.scan$, mapCleaner.scan$.getValue());
  const [progress, setProgress] = useState<Progress | null>(null);
  const [done, setDone] = useState<RemovalResult | null>(null);
  const count = scan.missingBackgrounds.length;

  const replace = async () => {
    setDone(null);
    if (!(await guard.ensureClosed())) return;
    setProgress({ done: 0, total: count });
    const r = await mapCleaner.replaceMissingBackgrounds(setProgress);
    setProgress(null);
    setDone(r);
  };

  return (
    <Card title={t("mc.bgTitle")} intro={t("mc.bgIntro")}>
      <Box sx={{ mb: guard.blocked ? 2 : 0 }}>
        <OsuOpenAlert show={guard.blocked} />
      </Box>
      <Stack direction={"row"} gap={2} alignItems={"center"}>
        {progress ? (
          <ProgressBar progress={progress} label={`${progress.done} / ${progress.total}`} />
        ) : (
          <>
            <Typography sx={{ flex: 1 }} color={count > 0 ? "text.primary" : "text.secondary"}>
              {count > 0 ? t("mc.bgCount", { count }) : t("mc.bgNone")}
            </Typography>
            <Button variant={"outlined"} disabled={count === 0 || guard.blocked} onClick={() => void replace()}>
              {t("mc.bgReplace")}
            </Button>
          </>
        )}
      </Stack>
      {done && (
        <Alert severity={done.failed.length > 0 ? "warning" : "success"} sx={{ mt: 2 }} onClose={() => setDone(null)}>
          {t("mc.bgDone", { count: done.removed.length })}
          {done.failed.length > 0 && ` (${done.failed.length} ✗)`}
        </Alert>
      )}
    </Card>
  );
}

function LocalScoresSection({ osuFolder, osuRunning }: { osuFolder: string; osuRunning: boolean }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<LoadedScores | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [alsoReplays, setAlsoReplays] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ severity: "success" | "warning" | "error"; text: string } | null>(null);
  const guard = useOsuGuard(osuRunning);

  const load = async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      setLoaded(await loadLocalScores(osuFolder));
    } catch (e) {
      setLoaded(null);
      setMessage({ severity: "error", text: t("ls.loadError", { error: e instanceof Error ? e.message : String(e) }) });
    }
    setLoading(false);
  };

  const toggle = (player: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(player)) next.delete(player);
      else next.add(player);
      return next;
    });

  const selectedCount = (loaded?.players ?? []).filter((p) => selected.has(p.player)).reduce((n, p) => n + p.count, 0);

  const remove = async () => {
    if (!loaded) return;
    setConfirming(false);
    setMessage(null);
    if (!(await guard.ensureClosed())) return;
    setWorking(true);
    const r = await removePlayersScores(osuFolder, [...selected], loaded.mtime, {
      removeReplays: alsoReplays,
      method: "trash",
    });
    setWorking(false);
    if (r.ok) {
      const replays = r.replays ? " " + removalText(t, { ...r.replays, method: "trash" }) : "";
      setMessage({ severity: "success", text: t("ls.done", { count: r.removedScores }) + replays });
      await load();
    } else if (r.reason === "osuRunning") {
      setMessage({ severity: "error", text: t("mc.osuBlocked") });
    } else if (r.reason === "changedOnDisk") {
      setMessage({ severity: "warning", text: t("ls.changed") });
    } else {
      setMessage({ severity: "error", text: t("ls.error", { error: r.error ?? "" }) });
    }
  };

  return (
    <Card title={t("ls.title")} intro={t("ls.intro")}>
      <Stack gap={1.5}>
        <OsuOpenAlert show={guard.blocked} />
        <Box>
          <Button variant={"outlined"} onClick={() => void load()} disabled={loading || working}>
            {t("ls.load")}
          </Button>
        </Box>
        {(loading || working) && <LinearProgress sx={{ "& .MuiLinearProgress-bar": { backgroundColor: ACCENT } }} />}
        {loaded && loaded.players.length === 0 && <Typography color={"text.secondary"}>{t("ls.none")}</Typography>}
        {loaded && loaded.players.length > 0 && (
          <>
            <Box sx={{ maxHeight: 320, overflowY: "auto" }}>
              {loaded.players.map((p) => (
                <Stack key={p.player} direction={"row"} alignItems={"center"}>
                  <FormControlLabel
                    sx={{ flex: 1 }}
                    control={<Checkbox checked={selected.has(p.player)} onChange={() => toggle(p.player)} sx={PINK} />}
                    label={p.player || "?"}
                  />
                  <Typography variant={"body2"} color={"text.secondary"}>
                    {t("ls.count", { count: p.count })}
                  </Typography>
                </Stack>
              ))}
            </Box>
            <FormControlLabel
              control={<Checkbox checked={alsoReplays} onChange={(e) => setAlsoReplays(e.target.checked)} sx={PINK} />}
              label={t("ls.alsoReplays")}
            />
            <Box>
              <Button
                variant={"contained"}
                color={"error"}
                disabled={selected.size === 0 || working || guard.blocked}
                onClick={() => setConfirming(true)}
                sx={{ fontWeight: 700 }}
              >
                {t("ls.remove")}
              </Button>
            </Box>
          </>
        )}
        {message && (
          <Alert severity={message.severity} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        )}
      </Stack>
      <ConfirmDialog
        open={confirming}
        title={t("ls.confirmTitle", { count: selectedCount })}
        text={t("ls.confirmText", { players: [...selected].join(", ") })}
        confirmLabel={t("mc.confirm")}
        danger
        onClose={() => setConfirming(false)}
        onConfirm={() => void remove()}
      />
    </Card>
  );
}

function ReplaysSection({ osuFolder, osuRunning }: { osuFolder: string; osuRunning: boolean }) {
  const { t } = useTranslation();
  const guard = useOsuGuard(osuRunning);
  const [groups, setGroups] = useState<ReplayGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<RemovalMethod>("trash");
  const [toDelete, setToDelete] = useState<ReplayGroup | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<DoneRemoval | null>(null);

  const find = async () => {
    setLoading(true);
    setGroups(await scanReplays(osuFolder));
    setLoading(false);
  };

  const remove = async (group: ReplayGroup) => {
    setToDelete(null);
    setResult(null);
    if (!(await guard.ensureClosed())) return;
    const paths = await replayFilesWithExtras(group.files);
    setProgress({ done: 0, total: paths.length });
    const r = await removeFiles(paths, method, { osuFolder, baseFolder: osuFolder, onProgress: setProgress });
    setProgress(null);
    setResult({ ...r, method });
    await find();
  };

  return (
    <Card title={t("mc.replaysTitle")} intro={t("mc.replaysIntro")}>
      <Stack gap={1.5}>
        <OsuOpenAlert show={guard.blocked} />
        <Stack direction={"row"} gap={2} alignItems={"center"} flexWrap={"wrap"}>
          <Button variant={"outlined"} onClick={() => void find()} disabled={loading || progress !== null}>
            {t("mc.replaysScan")}
          </Button>
          <RadioGroup row value={method} onChange={(e) => setMethod(e.target.value as RemovalMethod)}>
            {(Object.keys(METHOD_LABELS) as RemovalMethod[]).map((m) => (
              <FormControlLabel
                key={m}
                value={m}
                control={<Radio size={"small"} sx={PINK} />}
                label={t(METHOD_LABELS[m])}
              />
            ))}
          </RadioGroup>
        </Stack>
        {loading && <LinearProgress sx={{ "& .MuiLinearProgress-bar": { backgroundColor: ACCENT } }} />}
        {progress && (
          <ProgressBar progress={progress} label={t("mc.removing", { done: progress.done, total: progress.total })} />
        )}
        {groups && groups.length === 0 && <Typography color={"text.secondary"}>{t("mc.replaysNone")}</Typography>}
        {groups?.map((g) => (
          <Stack key={g.player} direction={"row"} alignItems={"center"} gap={2}>
            <Typography sx={{ fontWeight: 600, flex: 1 }}>{g.player}</Typography>
            <Typography variant={"body2"} color={"text.secondary"}>
              {t("mc.replaysGroup", { count: g.files.length, size: formatSize(g.size) })}
            </Typography>
            <Button
              size={"small"}
              color={method === "delete" ? "error" : "inherit"}
              disabled={progress !== null || guard.blocked}
              onClick={() => setToDelete(g)}
            >
              {t("mc.replaysRemove")}
            </Button>
          </Stack>
        ))}
        {result && <RemovalAlert result={result} onClose={() => setResult(null)} />}
      </Stack>
      <ConfirmDialog
        open={toDelete !== null}
        title={toDelete ? t("mc.replaysConfirm", { count: toDelete.files.length, player: toDelete.player }) : ""}
        text={
          method === "trash"
            ? t("mc.confirmTrash", { size: formatSize(toDelete?.size ?? 0) })
            : method === "move"
            ? t("mc.confirmMove", { folder: join(osuFolder, CLEANED_FOLDER), size: formatSize(toDelete?.size ?? 0) })
            : t("mc.confirmDelete", { size: formatSize(toDelete?.size ?? 0) })
        }
        confirmLabel={t("mc.confirm")}
        danger={method === "delete"}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && void remove(toDelete)}
      />
    </Card>
  );
}

const BACKUP_KIND_LABELS: Record<BackupFile["kind"], TranslationKey> = {
  collection: "mc.backupsKind.collection",
  scores: "mc.backupsKind.scores",
  other: "mc.backupsKind.other",
};

const RESTORE_TARGET_LABELS: Record<"collection" | "scores", TranslationKey> = {
  collection: "mc.restoreFile.collection",
  scores: "mc.restoreFile.scores",
};

function BackupsSection({ osuFolder, osuRunning }: { osuFolder: string; osuRunning: boolean }) {
  const { t, language } = useTranslation();
  const guard = useOsuGuard(osuRunning);
  const [toRestore, setToRestore] = useState<BackupFile | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);
  const [backups, setBackups] = useState<BackupFile[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<RemovalMethod>("trash");
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<DoneRemoval | null>(null);

  const load = async () => {
    const list = await listBackups(osuFolder);
    setBackups(list);
    setSelected(new Set());
  };

  useEffect(() => {
    void load();
  }, [osuFolder]);

  const toggle = (path: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const chosen = (backups ?? []).filter((b) => selected.has(b.path));
  const chosenSize = chosen.reduce((n, b) => n + b.size, 0);

  const remove = async () => {
    setConfirming(false);
    setWorking(true);
    setResult(null);
    const r = await removeFiles(
      chosen.map((b) => b.path),
      method,
      { osuFolder, baseFolder: osuFolder },
    );
    setWorking(false);
    setResult({ ...r, method });
    await load();
  };

  const restore = async (backup: BackupFile) => {
    setToRestore(null);
    setRestoreMessage(null);
    if (backup.kind === "other" || !(await guard.ensureClosed())) return;
    setWorking(true);
    const r = await restoreBackup(osuFolder, backup);
    setWorking(false);
    const file = t(RESTORE_TARGET_LABELS[backup.kind]);
    if (r.ok) {
      setRestoreMessage({ severity: "success", text: t("mc.restoreDone", { file }) });
      const collections = collectionStore.state$.getValue();
      if (backup.kind === "collection" && collections.status === "ready" && !collections.dirty) {
        void collectionStore.load(collections.osuFolder);
      }
    } else if (r.reason === "osuRunning") {
      setRestoreMessage({ severity: "error", text: t("mc.osuBlocked") });
    } else if (r.reason === "invalid") {
      setRestoreMessage({ severity: "error", text: t("mc.restoreInvalid") });
    } else {
      setRestoreMessage({ severity: "error", text: t("mc.restoreError", { error: r.error ?? "" }) });
    }
    await load();
  };

  const dateFormat = new Intl.DateTimeFormat(language === "it" ? "it-IT" : "en-GB", {
    dateStyle: "short",
    timeStyle: "medium",
  });

  return (
    <Card title={t("mc.backupsTitle")} intro={t("mc.backupsIntro")}>
      <Stack gap={1.5}>
        <Stack direction={"row"} gap={1.5} flexWrap={"wrap"}>
          <Button variant={"outlined"} onClick={() => void load()} disabled={working}>
            {t("mc.backupsLoad")}
          </Button>
          <Button onClick={() => void shell.openPath(backupFolder(osuFolder))}>{t("mc.backupsOpen")}</Button>
        </Stack>
        {backups && backups.length === 0 && <Typography color={"text.secondary"}>{t("mc.backupsNone")}</Typography>}
        {backups && backups.length > 0 && (
          <>
            <Stack direction={"row"} alignItems={"center"}>
              <Typography variant={"body2"} color={"text.secondary"} sx={{ flex: 1 }}>
                {t("mc.catInfo", { count: backups.length, size: formatSize(backups.reduce((n, b) => n + b.size, 0)) })}
              </Typography>
              <Button size={"small"} onClick={() => setSelected(new Set(backups.map((b) => b.path)))}>
                {t("mc.selectAll")}
              </Button>
              <Button size={"small"} onClick={() => setSelected(new Set())}>
                {t("mc.selectNone")}
              </Button>
            </Stack>
            <Box sx={{ maxHeight: 320, overflowY: "auto" }}>
              {backups.map((b) => (
                <Stack key={b.path} direction={"row"} alignItems={"center"} gap={1}>
                  <Checkbox size={"small"} checked={selected.has(b.path)} onChange={() => toggle(b.path)} sx={PINK} />
                  <Typography variant={"body2"} sx={{ fontWeight: 600, width: 130, flexShrink: 0 }}>
                    {t(BACKUP_KIND_LABELS[b.kind])}
                  </Typography>
                  <Typography variant={"body2"} sx={{ flex: 1 }} noWrap title={b.name}>
                    {dateFormat.format(b.modified)}
                  </Typography>
                  <Typography variant={"caption"} color={"text.secondary"}>
                    {formatSize(b.size)}
                  </Typography>
                  <Button
                    size={"small"}
                    disabled={b.kind === "other" || working || guard.blocked}
                    onClick={() => setToRestore(b)}
                  >
                    {t("mc.restore")}
                  </Button>
                </Stack>
              ))}
            </Box>
            <RadioGroup row value={method} onChange={(e) => setMethod(e.target.value as RemovalMethod)}>
              {(["trash", "delete"] as RemovalMethod[]).map((m) => (
                <FormControlLabel
                  key={m}
                  value={m}
                  control={<Radio size={"small"} sx={PINK} />}
                  label={t(METHOD_LABELS[m])}
                />
              ))}
            </RadioGroup>
            <Stack direction={"row"} gap={2} alignItems={"center"}>
              <Typography sx={{ flex: 1 }}>
                {t("mc.selected", { count: chosen.length, size: formatSize(chosenSize) })}
              </Typography>
              <Button
                variant={"contained"}
                color={method === "delete" ? "error" : "primary"}
                disabled={chosen.length === 0 || working}
                onClick={() => setConfirming(true)}
                sx={method === "delete" ? { fontWeight: 700 } : PINK_BUTTON}
              >
                {t("mc.backupsRemove")}
              </Button>
            </Stack>
          </>
        )}
        {result && <RemovalAlert result={result} onClose={() => setResult(null)} />}
        {backups && backups.length > 0 && <OsuOpenAlert show={guard.blocked} />}
        {restoreMessage && (
          <Alert severity={restoreMessage.severity} onClose={() => setRestoreMessage(null)}>
            {restoreMessage.text}
          </Alert>
        )}
      </Stack>
      <ConfirmDialog
        open={toRestore !== null}
        title={t("mc.restoreTitle")}
        text={
          toRestore && toRestore.kind !== "other"
            ? t("mc.restoreText", {
                file: t(RESTORE_TARGET_LABELS[toRestore.kind]),
                date: dateFormat.format(toRestore.modified),
              })
            : ""
        }
        confirmLabel={t("mc.restore")}
        danger
        onClose={() => setToRestore(null)}
        onConfirm={() => toRestore && void restore(toRestore)}
      />
      <ConfirmDialog
        open={confirming}
        title={t("mc.backupsConfirm", { count: chosen.length })}
        text={
          method === "trash"
            ? t("mc.confirmTrash", { size: formatSize(chosenSize) })
            : t("mc.confirmDelete", { size: formatSize(chosenSize) })
        }
        confirmLabel={t("mc.confirm")}
        danger={method === "delete"}
        onClose={() => setConfirming(false)}
        onConfirm={() => void remove()}
      />
    </Card>
  );
}

type MoveState =
  | { state: "idle" }
  | { state: "confirm"; destination: string }
  | { state: "moving"; progress: Progress }
  | { state: "done"; target: string }
  | { state: "error"; message: string };

function MoveSongsSection({ songsFolder, osuRunning }: { songsFolder: string; osuRunning: boolean }) {
  const { t } = useTranslation();
  const [linked, setLinked] = useState(false);
  const [move, setMove] = useState<MoveState>({ state: "idle" });
  const guard = useOsuGuard(osuRunning);

  useEffect(() => {
    void isLinkedFolder(songsFolder).then(setLinked);
  }, [songsFolder, move.state]);

  const choose = async () => {
    const destination: string | null = await frontendAPI.selectDirectory(songsFolder);
    if (destination) setMove({ state: "confirm", destination });
  };

  const start = async (destination: string) => {
    if (!(await guard.ensureClosed())) {
      setMove({ state: "idle" });
      return;
    }
    setMove({ state: "moving", progress: { done: 0, total: 0 } });
    try {
      const r = await moveSongsFolder(songsFolder, destination, (progress) => setMove({ state: "moving", progress }));
      if (r.ok) setMove({ state: "done", target: r.target });
      else
        setMove({
          state: "error",
          message: t(
            r.reason === "alreadyLinked"
              ? "mc.songsLinked"
              : r.reason === "targetExists"
              ? "mc.songsTargetExists"
              : "mc.songsInside",
          ),
        });
    } catch (e) {
      setMove({ state: "error", message: t("mc.songsError", { error: e instanceof Error ? e.message : String(e) }) });
    }
  };

  return (
    <Card title={t("mc.songsTitle")} intro={t("mc.songsIntro")}>
      <Stack gap={1.5}>
        <Typography variant={"body2"}>{t("mc.songsCurrent", { path: songsFolder })}</Typography>
        {linked && move.state !== "done" && <Alert severity={"info"}>{t("mc.songsLinked")}</Alert>}
        {move.state === "moving" ? (
          <ProgressBar
            progress={move.progress}
            label={t("mc.songsMoving", {
              done: formatSize(move.progress.done),
              total: formatSize(move.progress.total),
            })}
          />
        ) : (
          <Box>
            <Button variant={"outlined"} disabled={linked || guard.blocked} onClick={() => void choose()}>
              {t("mc.songsChoose")}
            </Button>
          </Box>
        )}
        {!linked && <OsuOpenAlert show={guard.blocked} />}
        {move.state === "done" && <Alert severity={"success"}>{t("mc.songsDone", { path: move.target })}</Alert>}
        {move.state === "error" && (
          <Alert severity={"error"} onClose={() => setMove({ state: "idle" })}>
            {move.message}
          </Alert>
        )}
      </Stack>
      <ConfirmDialog
        open={move.state === "confirm"}
        title={t("mc.songsConfirmTitle")}
        text={
          move.state === "confirm"
            ? t("mc.songsConfirm", { from: songsFolder, to: join(move.destination, "Songs") })
            : ""
        }
        confirmLabel={t("mc.confirm")}
        onClose={() => setMove({ state: "idle" })}
        onConfirm={() => move.state === "confirm" && void start(move.destination)}
      />
    </Card>
  );
}

export function MapCleaner() {
  const theater = useTheaterContext();
  const osuFolderService = theater.analyzer.osuFolderService;
  const songsFolder = useObservable(() => osuFolderService.songsFolder$, osuFolderService.songsFolder$.getValue());
  const osuFolder = osuFolderService.getOsuFolder();
  const osuRunning = useOsuRunning();

  return (
    <Box sx={{ height: "100%", overflowY: "auto", p: 2 }}>
      <Stack gap={2} sx={{ maxWidth: 1100, mx: "auto" }}>
        <CleanSection osuFolder={osuFolder} songsFolder={songsFolder} osuRunning={osuRunning} />
        <BackgroundsSection osuRunning={osuRunning} />
        <LocalScoresSection osuFolder={osuFolder} osuRunning={osuRunning} />
        <BackupsSection osuFolder={osuFolder} osuRunning={osuRunning} />
        <ReplaysSection osuFolder={osuFolder} osuRunning={osuRunning} />
        <MoveSongsSection songsFolder={songsFolder} osuRunning={osuRunning} />
      </Stack>
    </Box>
  );
}
