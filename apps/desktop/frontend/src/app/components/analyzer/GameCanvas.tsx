import { useTranslation } from "../../i18n";
import React, { useEffect, useRef } from "react";
import { useAnalysisApp } from "../../providers/TheaterProvider";
import { Box, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { useObservable } from "rxjs-hooks";
import { LightningBoltIcon } from "@heroicons/react/solid";
import InfoIcon from "@mui/icons-material/Info";
import { ignoreFocus } from "../../utils/focus";
import CloseIcon from "@mui/icons-material/Close";

function EmptyState() {
  const { t } = useTranslation();
  return (
    <Stack gap={2} alignItems={"center"}>
      <Stack gap={1} alignItems={"center"}>
        <InfoIcon sx={{ height: "2em", width: "2em" }} />
        <Typography>{t("canvas.noReplay")}</Typography>
      </Stack>
      <Stack gap={1} alignItems={"center"} direction={"row"}>
        <Box component={LightningBoltIcon} sx={{ height: "1em", color: "text.secondary" }} />
        <Typography color={"text.secondary"}>{t("canvas.hintF2")}</Typography>
      </Stack>
      <Stack gap={1} alignItems={"center"} direction={"row"}>
        <Box component={LightningBoltIcon} sx={{ height: "1em", color: "text.secondary" }} />
        <Typography color={"text.secondary"}>{t("canvas.hintOpen")}</Typography>
      </Stack>
    </Stack>
  );
}

const FRAME_MS = 16;
const WHEEL_STEP_MS = FRAME_MS * 5; // ~5 frames per wheel notch
const WHEEL_STEP_SHIFT_MS = 1000;
const WHEEL_STEP_CTRL_MS = FRAME_MS; // one frame

export const GameCanvas = () => {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const analysisApp = useAnalysisApp();
  const { status } = useObservable(() => analysisApp.scenarioManager.scenario$, { status: "DONE" });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (ev: WheelEvent) => {
      if (ev.altKey || analysisApp.scenarioManager.scenario$.getValue().status !== "DONE") return;
      ev.preventDefault();
      const clock = analysisApp.gameClock;
      const step = ev.shiftKey ? WHEEL_STEP_SHIFT_MS : ev.ctrlKey ? WHEEL_STEP_CTRL_MS : WHEEL_STEP_MS;
      const notches = Math.sign(ev.deltaY || ev.deltaX);
      if (clock.isPlaying) clock.pause();
      clock.seekTo(Math.max(0, Math.min(clock.durationInMs, clock.timeElapsedInMs + notches * step)));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [analysisApp]);

  const showOverlay = status !== "DONE";

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.append(analysisApp.stats());
    }
  }, [analysisApp]);
  useEffect(() => {
    if (status === "INIT") {
      analysisApp.stats().hidden = true;
    } else {
      analysisApp.stats().hidden = false;
    }
  }, [status, analysisApp]);

  useEffect(() => {
    if (canvas.current) {
      console.log("Initializing renderer to the canvas");
      analysisApp.onEnter(canvas.current);
    }
    return () => analysisApp.onHide();
  }, [analysisApp]);

  return (
    <Box ref={containerRef} sx={{ borderRadius: 2, overflow: "hidden", position: "relative", flex: 1 }}>
      {status === "DONE" && (
        <Tooltip title={t("canvas.closeReplay")}>
          <IconButton
            sx={{ position: "absolute", right: "0", top: "0" }}
            onClick={() => analysisApp.scenarioManager.clearReplay()}
            onFocus={ignoreFocus}
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
      )}
      <canvas
        style={{
          width: "100%",
          height: "100%",
        }}
        ref={canvas}
      />
      {showOverlay && (
        <Box
          sx={{
            position: "absolute",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            top: "0",
            left: "0",
            height: "100%",
            width: "100%",
            backgroundColor: "rgba(0,0,0,0.7)",
          }}
        >
          {status === "INIT" && <EmptyState />}
          {status === "LOADING" && <CircularProgress />}
          {status === "ERROR" && <Typography>{t("canvas.error")}</Typography>}
        </Box>
      )}
    </Box>
  );
};
