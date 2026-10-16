import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Slider,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import { Movie } from "@mui/icons-material";
import { shell } from "electron";
import { join } from "path";
import { useObservable } from "rxjs-hooks";
import { useTranslation } from "../../i18n";
import { frontendAPI } from "../../api";
import { useAnalysisApp } from "../../providers/TheaterProvider";
import { ignoreFocus } from "../../utils/focus";

const ACCENT = "#ff66aa";
const PINK_SWITCH = {
  "& .MuiSwitch-switchBase.Mui-checked": { color: ACCENT },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { backgroundColor: ACCENT },
};
const BAR = { "& .MuiLinearProgress-bar": { backgroundColor: ACCENT } };

function encoderLabel(enc?: string): string {
  switch (enc) {
    case "h264_nvenc":
      return "NVENC (NVIDIA GPU)";
    case "h264_amf":
      return "AMF (AMD GPU)";
    case "h264_qsv":
      return "QSV (Intel GPU)";
    case "libx264":
      return "CPU (x264)";
    default:
      return enc ?? "";
  }
}

function fmtTime(ms?: number): string {
  const s = Math.round((ms ?? 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Opt({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Box sx={{ width: "50%", minWidth: 180 }}>
      <FormControlLabel
        control={
          <Switch size={"small"} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} sx={PINK_SWITCH} />
        }
        label={label}
      />
      {hint && (
        <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block", ml: 2, mt: -0.5 }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

function sectionTitle(text: string) {
  return (
    <Typography variant={"subtitle2"} sx={{ fontWeight: 700, mt: 2, mb: 0.5 }}>
      {text}
    </Typography>
  );
}

function ExportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const analyzer = useAnalysisApp();
  const progress = useObservable(() => analyzer.videoExporter.exportProgress$, { phase: "idle" as const, value: 0 });

  // Video
  const [fps, setFps] = useState(60);
  const [renderHeight, setRenderHeight] = useState(1080);
  const [upscale, setUpscale] = useState(0);
  const [blurFactor, setBlurFactor] = useState(1);
  // Audio & timing
  const [includeAudio, setIncludeAudio] = useState(true);
  const [startAtFirstObject, setStartAtFirstObject] = useState(true);
  // Visuals (independent from the Reviewer)
  const [backgroundDim, setBackgroundDim] = useState(80);
  const [backgroundBlur, setBackgroundBlur] = useState(0);
  const [showCursor, setShowCursor] = useState(true);
  const [showCursorTrail, setShowCursorTrail] = useState(true);
  const [cursorScale, setCursorScale] = useState(100);
  const [applyReplayMods, setApplyReplayMods] = useState(true);
  // Overlays
  const [showKeys, setShowKeys] = useState(false);
  const [showUr, setShowUr] = useState(false);
  const [showMods, setShowMods] = useState(false);
  const [showHitErrorBar, setShowHitErrorBar] = useState(false);
  const [hitErrorBarScale, setHitErrorBarScale] = useState(100);
  const [showPlayfieldBorder, setShowPlayfieldBorder] = useState(false);
  const [showAnalysisCursor, setShowAnalysisCursor] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const busy = progress.phase === "rendering" || progress.phase === "encoding";

  const startExport = async () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const name = `osu!coach replay ${stamp}.mp4`;
    let defaultFileName = name;
    try {
      const desktop = await frontendAPI.getPath("desktop");
      if (desktop) defaultFileName = join(desktop, name);
    } catch {
      /* fall back to a bare filename */
    }
    analyzer.videoExporter.exportReplay({
      outputFps: fps,
      renderHeight,
      upscaleHeight: upscale || undefined,
      blurFactor,
      includeAudio,
      startAtFirstObject,
      backgroundDim: backgroundDim / 100,
      backgroundBlur: backgroundBlur / 100,
      showCursor,
      showCursorTrail,
      cursorScale: cursorScale / 100,
      showAnalysisCursor,
      showHitErrorBar,
      hitErrorBarScale: hitErrorBarScale / 100,
      showPlayfieldBorder,
      showKeys,
      showUr,
      showMods,
      showStats,
      applyReplayMods,
      defaultFileName,
    });
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth={"sm"}>
      <DialogTitle>{t("ev.title")}</DialogTitle>
      <DialogContent dividers>
        <Typography variant={"body2"} color={"text.secondary"} sx={{ mb: 1 }}>
          {t("ev.hint")}
        </Typography>

        {sectionTitle(t("ev.video"))}
        <Stack direction={"row"} gap={2} flexWrap={"wrap"}>
          <FormControl size={"small"} sx={{ minWidth: 100 }}>
            <InputLabel>{t("ev.fps")}</InputLabel>
            <Select label={t("ev.fps")} value={fps} onChange={(e) => setFps(Number(e.target.value))} disabled={busy}>
              {[30, 60, 120, 240, 480, 960].map((v) => (
                <MenuItem key={v} value={v}>
                  {v}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size={"small"} sx={{ minWidth: 120 }}>
            <InputLabel>{t("ev.resolution")}</InputLabel>
            <Select
              label={t("ev.resolution")}
              value={renderHeight}
              onChange={(e) => setRenderHeight(Number(e.target.value))}
              disabled={busy}
            >
              <MenuItem value={720}>720p</MenuItem>
              <MenuItem value={1080}>1080p</MenuItem>
            </Select>
          </FormControl>
          <FormControl size={"small"} sx={{ minWidth: 130 }}>
            <InputLabel>{t("ev.upscale")}</InputLabel>
            <Select label={t("ev.upscale")} value={upscale} onChange={(e) => setUpscale(Number(e.target.value))} disabled={busy}>
              <MenuItem value={0}>{t("ev.upscaleOff")}</MenuItem>
              <MenuItem value={1440}>1440p</MenuItem>
              <MenuItem value={2160}>4K</MenuItem>
            </Select>
          </FormControl>
          <FormControl size={"small"} sx={{ minWidth: 130 }}>
            <InputLabel>{t("ev.motionBlur")}</InputLabel>
            <Select
              label={t("ev.motionBlur")}
              value={blurFactor}
              onChange={(e) => setBlurFactor(Number(e.target.value))}
              disabled={busy}
            >
              <MenuItem value={1}>{t("ev.motionBlurOff")}</MenuItem>
              {[2, 4, 8, 16].map((v) => (
                <MenuItem key={v} value={v}>
                  ×{v}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
        {blurFactor > 1 && (
          <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block", mt: 0.5 }}>
            {t("ev.motionBlurHint", { src: fps * blurFactor })}
          </Typography>
        )}

        {sectionTitle(t("ev.visuals"))}
        <Typography variant={"caption"} sx={{ color: ACCENT, display: "block", mb: 0.5 }}>
          {t("ev.visualsNote")}
        </Typography>
        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography variant={"caption"}>{t("ev.backgroundDim", { pct: backgroundDim })}</Typography>
            <Slider size={"small"} value={backgroundDim} min={0} max={100} disabled={busy} onChange={(_, v) => setBackgroundDim(v as number)} sx={{ color: ACCENT }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography variant={"caption"}>{t("ev.backgroundBlur", { pct: backgroundBlur })}</Typography>
            <Slider size={"small"} value={backgroundBlur} min={0} max={100} disabled={busy} onChange={(_, v) => setBackgroundBlur(v as number)} sx={{ color: ACCENT }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography variant={"caption"}>{t("ev.cursorSize", { pct: cursorScale })}</Typography>
            <Slider
              size={"small"}
              value={cursorScale}
              min={10}
              max={200}
              disabled={busy || !showCursor}
              onChange={(_, v) => setCursorScale(v as number)}
              sx={{ color: ACCENT }}
            />
          </Box>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography variant={"caption"}>{t("ev.hitErrorBarScale", { pct: hitErrorBarScale })}</Typography>
            <Slider
              size={"small"}
              value={hitErrorBarScale}
              min={10}
              max={300}
              disabled={busy || !showHitErrorBar}
              onChange={(_, v) => setHitErrorBarScale(v as number)}
              sx={{ color: ACCENT }}
            />
          </Box>
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap" }}>
          <Opt label={t("ev.cursor")} checked={showCursor} onChange={setShowCursor} disabled={busy} />
          <Opt label={t("ev.cursorTrail")} checked={showCursorTrail} onChange={setShowCursorTrail} disabled={busy || !showCursor} />
          <Opt label={t("ev.applyReplayMods")} checked={applyReplayMods} onChange={setApplyReplayMods} disabled={busy} />
          <Opt label={t("ev.includeAudio")} checked={includeAudio} onChange={setIncludeAudio} disabled={busy} />
          <Opt label={t("ev.startAtFirstObject")} checked={startAtFirstObject} onChange={setStartAtFirstObject} disabled={busy} />
        </Box>

        {sectionTitle(t("ev.overlays"))}
        <Box sx={{ display: "flex", flexWrap: "wrap" }}>
          <Opt label={t("ev.overlayKeys")} checked={showKeys} onChange={setShowKeys} disabled={busy} />
          <Opt label={t("ev.overlayUr")} checked={showUr} onChange={setShowUr} disabled={busy} />
          <Opt label={t("ev.overlayMods")} checked={showMods} onChange={setShowMods} disabled={busy} />
          <Opt label={t("ev.hitErrorBar")} checked={showHitErrorBar} onChange={setShowHitErrorBar} disabled={busy} />
          <Opt label={t("ev.playfieldBorder")} checked={showPlayfieldBorder} onChange={setShowPlayfieldBorder} disabled={busy} />
          <Opt label={t("ev.analysisCursor")} checked={showAnalysisCursor} onChange={setShowAnalysisCursor} disabled={busy} />
          <Opt label={t("ev.stats")} checked={showStats} onChange={setShowStats} disabled={busy} />
        </Box>

        {progress.phase === "rendering" && (
          <Box sx={{ mt: 2 }}>
            <Typography variant={"body2"} sx={{ mb: 0.5 }}>
              {t("ev.rendering", { pct: Math.round(progress.value * 100) })}
            </Typography>
            <LinearProgress variant={"determinate"} value={progress.value * 100} sx={BAR} />
            <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block", mt: 0.5 }}>
              {t("ev.encoderLine", {
                encoder: encoderLabel(progress.encoder),
                time: fmtTime(progress.elapsedMs),
                fps: Math.round(progress.fps ?? 0),
              })}
            </Typography>
            {progress.value > 0.01 && (progress.elapsedMs ?? 0) > 0 && (
              <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block" }}>
                {t("ev.timeLeft", {
                  time: fmtTime((progress.elapsedMs! * (1 - progress.value)) / progress.value),
                })}
              </Typography>
            )}
          </Box>
        )}
        {progress.phase === "encoding" && (
          <Box sx={{ mt: 2 }}>
            <Typography variant={"body2"} sx={{ mb: 0.5 }}>
              {t("ev.encoding")}
            </Typography>
            <LinearProgress sx={BAR} />
            <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block", mt: 0.5 }}>
              {encoderLabel(progress.encoder)}
            </Typography>
          </Box>
        )}
        {progress.phase === "done" && (
          <Alert
            severity={"success"}
            sx={{ mt: 2 }}
            action={
              progress.file ? (
                <Button color={"inherit"} size={"small"} onClick={() => shell.showItemInFolder(progress.file as string)}>
                  {t("sc.openFolder")}
                </Button>
              ) : undefined
            }
          >
            {t("ev.done")}
            {progress.encoder && (
              <Typography variant={"caption"} sx={{ display: "block" }}>
                {encoderLabel(progress.encoder)} · {fmtTime(progress.elapsedMs)}
              </Typography>
            )}
          </Alert>
        )}
        {progress.phase === "error" && (
          <Alert severity={"error"} sx={{ mt: 2 }}>
            {t("ev.error", { error: progress.message ?? "" })}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            analyzer.videoExporter.reset();
            onClose();
          }}
          disabled={busy}
        >
          {t("common.close")}
        </Button>
        <Button
          variant={"contained"}
          onClick={startExport}
          disabled={busy}
          sx={{ backgroundColor: ACCENT, color: "#15151b", fontWeight: 700, "&:hover": { backgroundColor: "#e0558f" } }}
        >
          {t("ev.export")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ExportVideoButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title={t("ev.title")}>
        <IconButton onClick={() => setOpen(true)} onFocus={ignoreFocus}>
          <Movie />
        </IconButton>
      </Tooltip>
      {open && <ExportDialog onClose={() => setOpen(false)} />}
    </>
  );
}
