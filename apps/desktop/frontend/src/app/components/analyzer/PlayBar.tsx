import { useTranslation } from "../../i18n";
import {
  Box,
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  MenuList,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { Help, MoreVert, PauseCircle, PhotoCamera, PlayCircle, VolumeOff, VolumeUp } from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BaseAudioSettingsPanel } from "./BaseAudioSettingsPanel";
import { BaseGameTimeSlider } from "./BaseGameTimeSlider";
import { useGameClockControls, useGameClockTime } from "../../hooks/game-clock";
import { formatGameTime } from "@osujs/math";
import { useAudioSettings, useAudioSettingsService } from "../../hooks/audio";
import { useModControls } from "../../hooks/mods";
import modHiddenImg from "../../../assets/mod_hidden.png";
import { ALLOWED_SPEEDS, PlaybarColors } from "../../utils/constants";

import { ReplayAnalysisEvent } from "@osujs/core";
import { useObservable } from "rxjs-hooks";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { HelpModalDialog } from "./HelpModal";
import { BaseCurrentTime, GameCurrentTimeHandle } from "./BaseCurrentTime";
import { ignoreFocus } from "../../utils/focus";
import { useAnalysisApp, useCommonManagers } from "../../providers/TheaterProvider";
import { DEFAULT_PLAY_BAR_SETTINGS } from "../../services/common/playbar";

const centerUp = {
  anchorOrigin: {
    vertical: "top",
    horizontal: "center",
  },
  transformOrigin: {
    vertical: "bottom",
    horizontal: "center",
  },
};

function MoreMenu() {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: any) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const analyzer = useAnalysisApp();
  const handleTakeScreenshot = () => {
    analyzer.screenshotTaker.takeScreenshot();
    handleClose();
  };

  const [helpOpen, setHelpOpen] = useState(false);

  const handleOpenHelp = () => {
    setHelpOpen(true);
    handleClose();
  };

  return (
    <>
      <HelpModalDialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <IconButton
        aria-label={t("playbar.more")}
        id="long-button"
        aria-controls="long-menu"
        aria-haspopup="true"
        onClick={handleClick}
        onFocus={ignoreFocus}
      >
        <MoreVert />
      </IconButton>
      <Menu
        open={open}
        onClose={handleClose}
        anchorEl={anchorEl}
        anchorOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
      >
        <MenuItem onClick={handleTakeScreenshot}>
          <ListItemIcon>
            <PhotoCamera />
          </ListItemIcon>
          <ListItemText>{t("playbar.screenshot")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleOpenHelp}>
          <ListItemIcon>
            <Help />
          </ListItemIcon>
          <ListItemText>{t("common.help")}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

function AudioButton() {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const handlePopOverOpen = (event: any) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const { volume, muted } = useAudioSettings();
  const service = useAudioSettingsService();

  const handleClick = () => {
    service.toggleMuted();
  };
  return (
    <>
      <IconButton onClick={handlePopOverOpen}>{muted ? <VolumeOff /> : <VolumeUp />}</IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
      >
        <Box width={256}>
          <BaseAudioSettingsPanel
            master={volume.master}
            music={volume.music}
            effects={0}
            onMutedChange={(x) => service.setMuted(x)}
            onMasterChange={(x) => service.setMasterVolume(x)}
            onMusicChange={(x) => service.setMusicVolume(x)}
            onEffectsChange={(x) => service.setEffectsVolume(x)}
          />
        </Box>
      </Popover>
    </>
  );
}

function PlayButton() {
  const { isPlaying, toggleClock } = useGameClockControls();
  const Icon = !isPlaying ? PlayCircle : PauseCircle;

  return (
    <IconButton onClick={toggleClock} onFocus={ignoreFocus}>
      <Icon fontSize={"large"} />
    </IconButton>
  );
}

const timeAnimateFPS = 30;

function CurrentTime() {
  const analyzer = useAnalysisApp();
  const requestRef = useRef<number>(0);
  const timeRef = useRef<GameCurrentTimeHandle>(null);

  useEffect(() => {
    let last = -1;
    const requiredElapsed = 1000 / timeAnimateFPS;

    function animate(currentTimestamp: number) {
      const elapsed = currentTimestamp - last;
      if (elapsed > requiredElapsed) {
        if (timeRef.current) timeRef.current.updateTime(analyzer.gameClock.timeElapsedInMs);
        last = currentTimestamp;
      }
      requestRef.current = requestAnimationFrame(animate);
    }

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [analyzer]);
  return (
    <Box sx={{ width: "7em" }}>
      <BaseCurrentTime ref={timeRef} />
    </Box>
  );
}

function groupTimings(events: ReplayAnalysisEvent[]) {
  const missTimings: number[] = [];
  const mehTimings: number[] = [];
  const okTimings: number[] = [];
  const sliderBreakTimings: number[] = [];

  events.forEach((e) => {
    switch (e.type) {
      case "HitObjectJudgement":
        if (e.isSliderHead) {
          if (e.verdict === "MISS") sliderBreakTimings.push(e.time);
          return;
        } else {
          if (e.verdict === "MISS") missTimings.push(e.time);
          if (e.verdict === "MEH") mehTimings.push(e.time);
          if (e.verdict === "OK") okTimings.push(e.time);
        }
        break;
      case "CheckpointJudgement":
        if (!e.hit && !e.isLastTick) sliderBreakTimings.push(e.time);
        break;
      case "UnnecessaryClick":
        break;
    }
  });
  return { missTimings, mehTimings, okTimings, sliderBreakTimings };
}

function GameTimeSlider() {
  const { t } = useTranslation();
  const backgroundEnable = true;
  const currentTime = useGameClockTime(15);
  const { seekTo, duration } = useGameClockControls();
  const { gameSimulator } = useAnalysisApp();
  const { playbarSettingsStore } = useCommonManagers();
  const replayEvents = useObservable(() => gameSimulator.replayEvents$, []);
  const difficulties = useObservable(() => gameSimulator.difficulties$, []);
  const playbarSettings = useObservable(() => playbarSettingsStore.settings$, DEFAULT_PLAY_BAR_SETTINGS);

  const events = useMemo(() => {
    const { sliderBreakTimings, missTimings, mehTimings, okTimings } = groupTimings(replayEvents);
    return [
      { color: PlaybarColors.MISS, timings: missTimings, tooltip: t("playbar.misses") },
      { color: PlaybarColors.SLIDER_BREAK, timings: sliderBreakTimings, tooltip: t("playbar.sliderbreaks") },
      { color: PlaybarColors.MEH, timings: mehTimings, tooltip: "50s" },
      { color: PlaybarColors.OK, timings: okTimings, tooltip: "100s" },
    ];
  }, [replayEvents, t]);

  return (
    <BaseGameTimeSlider
      backgroundEnable={backgroundEnable}
      duration={duration}
      currentTime={currentTime}
      onChange={seekTo}
      events={events}
      difficulties={playbarSettings.difficultyGraphEnabled ? difficulties : []}
    />
  );
}

function Duration() {
  const { duration } = useGameClockControls();
  const f = formatGameTime(duration);

  return <Typography>{f}</Typography>;
}

function HiddenButton() {
  const { t } = useTranslation();
  const { setHidden, hidden: hiddenEnabled, hiddenAvailable } = useModControls();
  const handleClick = useCallback(() => setHidden(!hiddenEnabled), [hiddenEnabled, setHidden]);

  return (
    <Tooltip title={t(hiddenAvailable ? "playbar.hiddenToggle" : "playbar.hiddenUnavailable")}>
      <span style={{ display: "inline-flex" }}>
        <Button onFocus={ignoreFocus} onClick={handleClick} disabled={!hiddenAvailable} sx={{ px: 0 }}>
          <img
            src={modHiddenImg}
            alt={"ModHidden"}
            style={{
              filter: `grayscale(${hiddenEnabled ? "0%" : "100%"})`,
              opacity: hiddenAvailable ? 1 : 0.3,
              width: "60%",
            }}
          />
        </Button>
      </span>
    </Tooltip>
  );
}

interface BaseSpeedButtonProps {
  value: number;
  onChange: (value: number) => any;
}

const speedLabels: Record<number, string> = { 0.75: "HT", 1.5: "DT" } as const;

function BaseSpeedButton(props: BaseSpeedButtonProps) {
  const { value, onChange } = props;

  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: any) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const formatSpeed = (s: number) => `${s}x`;

  return (
    <>
      <Button
        sx={{
          color: "text.primary",
          textTransform: "none",
          fontSize: "1em",
        }}
        size={"small"}
        onClick={handleClick}
        onFocus={ignoreFocus}
      >
        {formatSpeed(value)}
      </Button>
      <Menu
        open={open}
        onClose={handleClose}
        anchorEl={anchorEl}
        anchorOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
      >
        <MenuList>
          {ALLOWED_SPEEDS.map((s) => (
            <MenuItem
              key={s}
              onClick={() => {
                onChange(s);
                handleClose();
              }}
              sx={{ width: "120px", maxWidth: "100%" }}
            >
              <ListItemText>{formatSpeed(s)}</ListItemText>
              <Typography variant="body2" color="text.secondary">
                {speedLabels[s] ?? ""}
              </Typography>
            </MenuItem>
          ))}
        </MenuList>
      </Menu>
    </>
  );
}

function SpeedButton() {
  const { speed, setSpeed } = useGameClockControls();
  return <BaseSpeedButton value={speed} onChange={setSpeed} />;
}

function RecordButton() {
  const { t } = useTranslation();
  const { clipRecorder } = useAnalysisApp();
  const recordingSince = useObservable(() => clipRecorder.recordingSince$, 0);

  const isRecording = recordingSince > 0;

  const recordingTime = "3:00";

  const handleClick = useCallback(() => {
    if (isRecording) {
      clipRecorder.stopRecording();
    } else {
      clipRecorder.startRecording();
    }
  }, [isRecording, clipRecorder]);

  return (
    <Tooltip title={t("playbar.recordClip")}>
      <IconButton onClick={handleClick}>
        <FiberManualRecordIcon
          sx={{
            color: isRecording ? "red" : "text.primary",
          }}
        />
      </IconButton>
    </Tooltip>
  );
}

const VerticalDivider = () => <Divider orientation={"vertical"} sx={{ height: "80%" }} />;

export function PlayBar() {
  return (
    <Stack height={64} gap={1} p={2} direction={"row"} alignItems={"center"}>
      <PlayButton />
      <CurrentTime />
      <GameTimeSlider />
      <Duration />
      <VerticalDivider />
      <Stack direction={"row"} alignItems={"center"} justifyContent={"center"}>
        <AudioButton />
        <SpeedButton />
        <HiddenButton />
        <MoreMenu />
      </Stack>
    </Stack>
  );
}
