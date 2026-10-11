import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Slider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { FlashlightOff, FlashlightOn, Restore, Save } from "@mui/icons-material";
import { ipcRenderer } from "electron";
import { writeFile } from "fs/promises";
import { join } from "path";
import { useTranslation } from "../../i18n";
import { useTheaterContext } from "../../providers/TheaterProvider";
import { frontendAPI } from "../../api";
import { resolveBuiltInSkinsFolder } from "../../services/common/local/builtin-skins";
import {
  COMBO_STEPS,
  DEFAULT_FLASHLIGHT_SETTINGS,
  FlashlightSettings,
  OSU_REFERENCE_HEIGHT,
} from "../../services/flashlight/flashlight-math";
import {
  applyFlashlightCursor,
  canvasToPng,
  detectCurrentSkin,
  renderFlashlightCursor,
} from "../../services/flashlight/flashlight-cursor";
import { listSkins, LoadedSkin, loadSkin, restoreGroupAndIni } from "../../services/skins/skin-files";

const ACCENT = "#ff66aa";
const STORAGE_KEY = "osucoach-flashlight";
const PINK_BUTTON = {
  backgroundColor: ACCENT,
  color: "#15151b",
  fontWeight: 700,
  "&:hover": { backgroundColor: "#ff85bb" },
};
const PINK = { color: ACCENT, "&.Mui-checked": { color: ACCENT } };

interface DisplayInfo {
  id: number;
  width: number;
  height: number;
  scaleFactor: number;
  primary: boolean;
}

interface OverlayStatus {
  running: boolean;
  hidden: boolean;
  source: "tosu" | "window" | "none" | null;
}

const SOURCE_SEVERITY = { tosu: "success", window: "info", none: "warning" } as const;

function loadSettings(): FlashlightSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_FLASHLIGHT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_FLASHLIGHT_SETTINGS;
  } catch {
    return DEFAULT_FLASHLIGHT_SETTINGS;
  }
}

function saveSettings(settings: FlashlightSettings): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

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

function ValueSlider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <Box>
      <Stack direction={"row"} justifyContent={"space-between"}>
        <Typography variant={"body2"} sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant={"body2"} color={"text.secondary"}>
          {display}
        </Typography>
      </Stack>
      <Slider
        size={"small"}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(_, v) => onChange(v as number)}
        sx={{ color: ACCENT }}
      />
    </Box>
  );
}

function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
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
        <Button onClick={onClose}>{t("col.cancel")}</Button>
        <Button variant={"contained"} onClick={onConfirm} sx={PINK_BUTTON}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CursorPreview({ source, aspect }: { source: HTMLCanvasElement | null; aspect: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const width = canvas.width;
    const height = Math.round(width / aspect);
    canvas.height = height;
    ctx.fillStyle = "#3a3a46";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    for (let x = 0; x < width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    if (!source) return;
    const viewHeight = OSU_REFERENCE_HEIGHT;
    const viewWidth = OSU_REFERENCE_HEIGHT * aspect;
    const sx = source.width / 2 - viewWidth / 2;
    const sy = source.height / 2 - viewHeight / 2;
    ctx.drawImage(source, sx, sy, viewWidth, viewHeight, 0, 0, width, height);
  }, [source, aspect]);
  return <canvas ref={ref} width={480} style={{ width: "100%", maxWidth: 480, borderRadius: 8, display: "block" }} />;
}

export function FlashlightScreen() {
  const { t } = useTranslation();
  const theater = useTheaterContext();
  const osuFolder = theater.analyzer.osuFolderService.getOsuFolder();
  const [settings, setSettings] = useState<FlashlightSettings>(loadSettings);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [status, setStatus] = useState<OverlayStatus>({ running: false, hidden: false, source: null });

  const [skins, setSkins] = useState<string[]>([]);
  const [currentSkin, setCurrentSkin] = useState<string | null>(null);
  const [skinName, setSkinName] = useState<string>("");
  const [skin, setSkin] = useState<LoadedSkin | null>(null);
  const [builtInSkins, setBuiltInSkins] = useState<string>("");
  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(false);
  const [confirm, setConfirm] = useState<"apply" | "restore" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const display = displays.find((d) => d.id === settings.displayId) ?? displays.find((d) => d.primary) ?? displays[0];
  const aspect = display ? display.width / display.height : 16 / 9;

  const update = (partial: Partial<FlashlightSettings>) =>
    setSettings((s) => {
      const next = { ...s, ...partial };
      saveSettings(next);
      return next;
    });

  useEffect(() => {
    void ipcRenderer.invoke("fl:displays").then((list: DisplayInfo[]) => setDisplays(list));
    void ipcRenderer.invoke("fl:status").then((s: OverlayStatus) => setStatus(s));
    const onStatus = (_: unknown, s: OverlayStatus) => setStatus(s);
    ipcRenderer.on("fl:status", onStatus);
    void frontendAPI.getPath("appResources").then((p: string) => setBuiltInSkins(resolveBuiltInSkinsFolder(p)));
    return () => {
      ipcRenderer.removeListener("fl:status", onStatus);
    };
  }, []);

  useEffect(() => {
    if (!status.running || !display) return;
    const timer = setTimeout(() => {
      void ipcRenderer.invoke("fl:start", { ...settings, displayId: display.id });
    }, 150);
    return () => clearTimeout(timer);
  }, [settings, status.running, display]);

  const toggleOverlay = async () => {
    if (status.running) setStatus(await ipcRenderer.invoke("fl:stop"));
    else if (display) setStatus(await ipcRenderer.invoke("fl:start", { ...settings, displayId: display.id }));
  };

  const refreshSkins = useCallback(async () => {
    const [list, current] = await Promise.all([listSkins(osuFolder), detectCurrentSkin(osuFolder)]);
    setSkins(list);
    setCurrentSkin(current);
    setSkinName((name) => name || (current && list.includes(current) ? current : list[0] ?? ""));
  }, [osuFolder]);

  useEffect(() => {
    void refreshSkins();
  }, [refreshSkins]);

  const reloadSkin = useCallback(async () => {
    if (!skinName) return setSkin(null);
    try {
      setSkin(await loadSkin(osuFolder, skinName));
    } catch {
      setSkin(null);
    }
  }, [osuFolder, skinName]);

  useEffect(() => {
    void reloadSkin();
  }, [reloadSkin]);

  useEffect(() => {
    if (!skin || !builtInSkins) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setRendering(true);
      try {
        const canvas = await renderFlashlightCursor(skin, settings, aspect, builtInSkins);
        if (!cancelled) setPreview(canvas);
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [skin, builtInSkins, settings.radius, settings.darkness, settings.softness, aspect]);

  const apply = async () => {
    setConfirm(null);
    if (!skin || !preview) return;
    try {
      await applyFlashlightCursor(skin, await canvasToPng(preview));
      setMessage({ ok: true, text: t("fl.applied", { skin: skin.name }) });
    } catch (e) {
      setMessage({ ok: false, text: t("sk.error", { error: e instanceof Error ? e.message : String(e) }) });
    }
    await reloadSkin();
  };

  const restore = async () => {
    setConfirm(null);
    if (!skin) return;
    try {
      await restoreGroupAndIni(osuFolder, skin.name, "cursor");
      setMessage({ ok: true, text: t("fl.restored", { skin: skin.name }) });
    } catch (e) {
      setMessage({ ok: false, text: t("sk.error", { error: e instanceof Error ? e.message : String(e) }) });
    }
    await reloadSkin();
  };

  const saveAs = async () => {
    if (!preview) return;
    const path = await frontendAPI.selectSaveFile(join(skin?.folder ?? osuFolder, "cursor.png"));
    if (!path) return;
    try {
      await writeFile(path, await canvasToPng(preview));
      setMessage({ ok: true, text: t("fl.savedFile", { path }) });
    } catch (e) {
      setMessage({ ok: false, text: t("sk.error", { error: e instanceof Error ? e.message : String(e) }) });
    }
  };

  const applied = skin?.modified.has("cursor") ?? false;

  return (
    <Box sx={{ height: "100%", overflowY: "auto", p: 2 }}>
      <Stack gap={2} sx={{ maxWidth: 1000, mx: "auto" }}>
        <Card title={t("fl.lookTitle")} intro={t("fl.lookIntro")}>
          <Stack gap={1.5}>
            <ValueSlider
              label={t("fl.size")}
              value={settings.radius}
              display={`${Math.round(settings.radius * 100)}%`}
              min={0.1}
              max={0.6}
              step={0.01}
              onChange={(radius) => update({ radius })}
            />
            <ValueSlider
              label={t("fl.darkness")}
              value={settings.darkness}
              display={`${Math.round(settings.darkness * 100)}%`}
              min={0.3}
              max={1}
              step={0.01}
              onChange={(darkness) => update({ darkness })}
            />
            <ValueSlider
              label={t("fl.softness")}
              value={settings.softness}
              display={`${Math.round(settings.softness * 100)}%`}
              min={0}
              max={0.9}
              step={0.01}
              onChange={(softness) => update({ softness })}
            />
          </Stack>
        </Card>

        <Card title={t("fl.overlayTitle")} intro={t("fl.overlayIntro")}>
          <Stack gap={1.5}>
            {displays.length > 1 && (
              <TextField
                select
                size={"small"}
                label={t("fl.display")}
                value={display?.id ?? ""}
                onChange={(e) => update({ displayId: Number(e.target.value) })}
                sx={{ maxWidth: 320 }}
              >
                {displays.map((d, i) => (
                  <MenuItem key={d.id} value={d.id}>
                    {t("fl.displayItem", { n: i + 1, width: d.width, height: d.height })}
                    {d.primary ? ` · ${t("fl.primary")}` : ""}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.comboShrink}
                  onChange={(e) => update({ comboShrink: e.target.checked })}
                  sx={PINK}
                />
              }
              label={t("fl.comboShrink", {
                first: Math.round(COMBO_STEPS[1].scale * 100),
                second: Math.round(COMBO_STEPS[0].scale * 100),
              })}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.onlyWhilePlaying}
                  onChange={(e) => update({ onlyWhilePlaying: e.target.checked })}
                  sx={PINK}
                />
              }
              label={t("fl.onlyWhilePlaying")}
            />
            {(settings.comboShrink || settings.onlyWhilePlaying) && (
              <Typography variant={"caption"} color={"text.secondary"}>
                {t("fl.needsTosu")}
              </Typography>
            )}
            {status.running && status.source && (settings.comboShrink || settings.onlyWhilePlaying) && (
              <Alert severity={SOURCE_SEVERITY[status.source]}>{t(`fl.source.${status.source}` as const)}</Alert>
            )}
            <Stack direction={"row"} gap={2} alignItems={"center"} flexWrap={"wrap"}>
              <Button
                variant={"contained"}
                startIcon={status.running ? <FlashlightOff /> : <FlashlightOn />}
                onClick={() => void toggleOverlay()}
                disabled={!display}
                sx={status.running ? { fontWeight: 700 } : PINK_BUTTON}
                color={status.running ? "inherit" : "primary"}
              >
                {t(status.running ? "fl.stop" : "fl.start")}
              </Button>
              {status.running && (
                <Chip
                  label={t(status.hidden ? "fl.statusHidden" : "fl.statusActive")}
                  sx={status.hidden ? {} : { backgroundColor: ACCENT, color: "#15151b", fontWeight: 700 }}
                />
              )}
              <Typography variant={"body2"} color={"text.secondary"}>
                {t("fl.hotkey")}
              </Typography>
            </Stack>
            <Alert severity={"info"}>
              {t("fl.overlayLimits")}
              <Box
                component={"span"}
                sx={{
                  display: "block",
                  mt: 1,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  fontWeight: 700,
                  color: ACCENT,
                  backgroundColor: "rgba(255,102,170,0.12)",
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                {t("fl.overlayFallback")}
              </Box>
            </Alert>
          </Stack>
        </Card>

        <Card title={t("fl.cursorTitle")} intro={t("fl.cursorIntro")}>
          <Stack gap={2}>
            <Stack direction={"row"} gap={2} alignItems={"center"} flexWrap={"wrap"}>
              <TextField
                select
                size={"small"}
                label={t("fl.skin")}
                value={skins.includes(skinName) ? skinName : ""}
                onChange={(e) => setSkinName(e.target.value)}
                sx={{ minWidth: 280 }}
              >
                {skins.map((name) => (
                  <MenuItem key={name} value={name}>
                    {name}
                    {name === currentSkin ? ` · ${t("fl.inUse")}` : ""}
                  </MenuItem>
                ))}
              </TextField>
              {currentSkin && skinName !== currentSkin && skins.includes(currentSkin) && (
                <Button size={"small"} onClick={() => setSkinName(currentSkin)}>
                  {t("fl.useCurrent")}
                </Button>
              )}
              {!currentSkin && (
                <Typography variant={"caption"} color={"text.secondary"}>
                  {t("fl.currentUnknown")}
                </Typography>
              )}
            </Stack>
            <Box sx={{ position: "relative", maxWidth: 480 }}>
              <CursorPreview source={preview} aspect={aspect} />
              {rendering && (
                <CircularProgress size={24} sx={{ position: "absolute", top: 12, right: 12, color: ACCENT }} />
              )}
            </Box>
            <Stack direction={"row"} gap={1.5} flexWrap={"wrap"}>
              <Button
                variant={"contained"}
                startIcon={<FlashlightOn />}
                disabled={!skin || !preview}
                onClick={() => setConfirm("apply")}
                sx={PINK_BUTTON}
              >
                {t("fl.generate")}
              </Button>
              <Button startIcon={<Save />} disabled={!preview} onClick={() => void saveAs()}>
                {t("fl.saveAs")}
              </Button>
              {applied && (
                <Button color={"inherit"} startIcon={<Restore />} onClick={() => setConfirm("restore")}>
                  {t("fl.restore")}
                </Button>
              )}
            </Stack>
            {message && (
              <Alert severity={message.ok ? "success" : "error"} onClose={() => setMessage(null)}>
                {message.text}
              </Alert>
            )}
            <Typography variant={"caption"} color={"text.secondary"}>
              {t("fl.cursorNotes")}
            </Typography>
          </Stack>
        </Card>
      </Stack>

      <ConfirmDialog
        open={confirm === "apply"}
        title={t("fl.applyTitle")}
        text={t("fl.applyText", { skin: skinName })}
        confirmLabel={t("fl.generate")}
        onClose={() => setConfirm(null)}
        onConfirm={() => void apply()}
      />
      <ConfirmDialog
        open={confirm === "restore"}
        title={t("fl.restoreTitle")}
        text={t("fl.restoreText", { skin: skinName })}
        confirmLabel={t("fl.restore")}
        onClose={() => setConfirm(null)}
        onConfirm={() => void restore()}
      />
    </Box>
  );
}
