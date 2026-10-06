import { useTranslation } from "../../i18n";
import { Box, Slider, Stack, Tooltip, Typography } from "@mui/material";
import { VolumeDown, VolumeUp } from "@mui/icons-material";

type Change = (x: number) => void;

interface BaseAudioSettingsPanelProps {
  master: number;
  effects: number;
  music: number;

  onMasterChange: Change;
  onEffectsChange: Change;
  onMusicChange: Change;
  onMutedChange: (muted: boolean) => unknown;
}

export function VolumeSlider({ disabled, onChange, value }: { disabled?: boolean; onChange: Change; value: number }) {
  return (
    <Stack gap={2} direction={"row"}>
      <VolumeDown />
      <Slider
        size="small"
        valueLabelDisplay="auto"
        disabled={disabled}
        value={Math.floor(value * 100)}
        step={1}
        onChange={(_, x) => onChange((x as number) / 100)}
      />
      <VolumeUp />
    </Stack>
  );
}

export function BaseAudioSettingsPanel(props: BaseAudioSettingsPanelProps) {
  const { t } = useTranslation();
  const { master, effects, music, onMasterChange, onEffectsChange, onMusicChange, onMutedChange } = props;
  return (
    <Stack
      sx={{
        p: 2,
      }}
      gap={1}
    >
      <Box>
        <Typography id="input-slider" gutterBottom>
          {t("settings.masterVolume")}
        </Typography>
        <VolumeSlider onChange={onMasterChange} value={master} />
      </Box>

      <Box>
        <Typography id="input-slider" gutterBottom>
          {t("settings.musicVolume")}
        </Typography>
        <VolumeSlider onChange={onMusicChange} value={music} />
      </Box>
      <Box>
        <Typography id="input-slider" gutterBottom>
          {t("settings.effectsVolume")}
        </Typography>
        <Tooltip title={t("settings.hitSoundsSoon")}>
          <span>
            <VolumeSlider disabled={true} onChange={onEffectsChange} value={effects} />
          </span>
        </Tooltip>
      </Box>
    </Stack>
  );
}
