import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { useAnalysisApp, useCommonManagers } from "../../providers/TheaterProvider";
import { ignoreFocus } from "../../utils/focus";

const ACCENT = "#ff66aa";
const PINK_SWITCH = {
  "& .MuiSwitch-switchBase.Mui-checked": { color: ACCENT },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { backgroundColor: ACCENT },
};
const BAR = { "& .MuiLinearProgress-bar": { backgroundColor: ACCENT } };

function ExportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const analyzer = useAnalysisApp();
  const { beatmapBackgroundSettingsStore } = useCommonManagers();
  const progress = useObservable(() => analyzer.videoExporter.exportProgress$, { phase: "idle" as const, value: 0 });
  const background = useObservable(() => beatmapBackgroundSettingsStore.settings$, { dim: 0.8, blur: 0.4, enabled: true });

  const [fps, setFps] = useState(60);
  const [renderHeight, setRenderHeight] = useState(1080);
  const [upscale, setUpscale] = useState(0); // 0 = off, else target height
  const [blurFactor, setBlurFactor] = useState(1); // motion blur: render fps × this, blend down
  const [clean, setClean] = useState(true);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [startAtFirstObject, setStartAtFirstObject] = useState(true);

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
      clean,
      includeAudio,
      startAtFirstObject,
      defaultFileName,
    });
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth={"sm"}>
      <DialogTitle>{t("ev.title")}</DialogTitle>
      <DialogContent dividers>
        <Typography variant={"body2"} color={"text.secondary"} sx={{ mb: 2 }}>
          {t("ev.hint")}
        </Typography>

        <Stack direction={"row"} gap={2} flexWrap={"wrap"} sx={{ mb: 2 }}>
          <FormControl size={"small"} sx={{ minWidth: 110 }}>
            <InputLabel>{t("ev.fps")}</InputLabel>
            <Select label={t("ev.fps")} value={fps} onChange={(e) => setFps(Number(e.target.value))} disabled={busy}>
              <MenuItem value={30}>30</MenuItem>
              <MenuItem value={60}>60</MenuItem>
              <MenuItem value={120}>120</MenuItem>
              <MenuItem value={240}>240</MenuItem>
              <MenuItem value={480}>480</MenuItem>
              <MenuItem value={960}>960</MenuItem>
            </Select>
          </FormControl>
          <FormControl size={"small"} sx={{ minWidth: 130 }}>
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
          <FormControl size={"small"} sx={{ minWidth: 150 }}>
            <InputLabel>{t("ev.upscale")}</InputLabel>
            <Select
              label={t("ev.upscale")}
              value={upscale}
              onChange={(e) => setUpscale(Number(e.target.value))}
              disabled={busy}
            >
              <MenuItem value={0}>{t("ev.upscaleOff")}</MenuItem>
              <MenuItem value={1440}>1440p</MenuItem>
              <MenuItem value={2160}>4K</MenuItem>
            </Select>
          </FormControl>
          <FormControl size={"small"} sx={{ minWidth: 150 }}>
            <InputLabel>{t("ev.motionBlur")}</InputLabel>
            <Select
              label={t("ev.motionBlur")}
              value={blurFactor}
              onChange={(e) => setBlurFactor(Number(e.target.value))}
              disabled={busy}
            >
              <MenuItem value={1}>{t("ev.motionBlurOff")}</MenuItem>
              <MenuItem value={2}>×2</MenuItem>
              <MenuItem value={4}>×4</MenuItem>
              <MenuItem value={8}>×8</MenuItem>
              <MenuItem value={16}>×16</MenuItem>
            </Select>
          </FormControl>
        </Stack>
        {blurFactor > 1 && (
          <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block", mb: 1 }}>
            {t("ev.motionBlurHint", { src: fps * blurFactor })}
          </Typography>
        )}

        <Box sx={{ mb: 1 }}>
          <Typography variant={"body2"} sx={{ mb: 0.5 }}>
            {t("ev.backgroundDim", { pct: Math.round(background.dim * 100) })}
          </Typography>
          <Slider
            size={"small"}
            value={Math.round(background.dim * 100)}
            min={0}
            max={100}
            step={1}
            disabled={busy}
            onChange={(_, v) => beatmapBackgroundSettingsStore.setDim((v as number) / 100)}
            sx={{ color: ACCENT, maxWidth: 320 }}
          />
        </Box>

        <FormControlLabel
          control={
            <Switch
              checked={startAtFirstObject}
              onChange={(e) => setStartAtFirstObject(e.target.checked)}
              sx={PINK_SWITCH}
              disabled={busy}
            />
          }
          label={t("ev.startAtFirstObject")}
        />
        <br />
        <FormControlLabel
          control={<Switch checked={clean} onChange={(e) => setClean(e.target.checked)} sx={PINK_SWITCH} disabled={busy} />}
          label={t("ev.cleanLook")}
        />
        <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block", mb: 1 }}>
          {clean ? t("ev.cleanLookOn") : t("ev.cleanLookOff")}
        </Typography>
        <FormControlLabel
          control={
            <Switch checked={includeAudio} onChange={(e) => setIncludeAudio(e.target.checked)} sx={PINK_SWITCH} disabled={busy} />
          }
          label={t("ev.includeAudio")}
        />

        {progress.phase === "rendering" && (
          <Box sx={{ mt: 2 }}>
            <Typography variant={"body2"} sx={{ mb: 0.5 }}>
              {t("ev.rendering", { pct: Math.round(progress.value * 100) })}
            </Typography>
            <LinearProgress variant={"determinate"} value={progress.value * 100} sx={BAR} />
          </Box>
        )}
        {progress.phase === "encoding" && (
          <Box sx={{ mt: 2 }}>
            <Typography variant={"body2"} sx={{ mb: 0.5 }}>
              {t("ev.encoding")}
            </Typography>
            <LinearProgress sx={BAR} />
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
