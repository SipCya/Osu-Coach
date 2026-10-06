import { Language, LANGUAGES, TranslationKey, useTranslation } from "../../i18n";
import { useSettingsModalContext } from "../../providers/SettingsProvider";
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Modal,
  Paper,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { Brush, SportsEsports, Tune } from "@mui/icons-material";
import { BaseSettingsModal } from "./BaseSettingsModal";
import { useCommonManagers } from "../../providers/TheaterProvider";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useObservable } from "rxjs-hooks";
import { DEFAULT_HIT_ERROR_BAR_SETTINGS } from "../../services/common/hit-error-bar";
import { DEFAULT_PLAY_BAR_SETTINGS } from "../../services/common/playbar";
import { DEFAULT_OSU_SKIN_ID, DEFAULT_YUGEN_SKIN_ID, SkinId, SkinSource, stringToSkinId } from "../../model/SkinId";
import { DEFAULT_BEATMAP_RENDER_SETTINGS } from "../../services/common/beatmap-render";
import { DEFAULT_SKIN_SETTINGS } from "../../services/common/skin";
import { DEFAULT_REPLAY_CURSOR_SETTINGS } from "../../services/common/replay-cursor";
import { DEFAULT_ANALYSIS_CURSOR_SETTINGS } from "../../services/analysis/analysis-cursor";
import { frontendAPI } from "../../api";

const sourceNameKey: Record<SkinSource, TranslationKey> = {
  osu: "settings.skinSourceOsu",
  builtin: "settings.skinSourceBuiltin",
};

const percent = (value: number) => `${value}%`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography
        variant={"overline"}
        color={"text.secondary"}
        sx={{ fontWeight: 700, letterSpacing: 1, display: "block", mb: 0.5 }}
      >
        {title}
      </Typography>
      <Paper variant={"outlined"} sx={{ borderRadius: 2, backgroundColor: "transparent" }}>
        <Stack divider={<Divider />}>{children}</Stack>
      </Paper>
    </Box>
  );
}

function Row({
  label,
  description,
  disabled,
  children,
}: {
  label: string;
  description?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Stack
      direction={"row"}
      alignItems={"center"}
      gap={3}
      sx={{ px: 2, py: 1.25, minHeight: 56, opacity: disabled ? 0.5 : 1 }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography>{label}</Typography>
        {description && (
          <Typography variant={"caption"} color={"text.secondary"}>
            {description}
          </Typography>
        )}
      </Box>
      <Box sx={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{children}</Box>
    </Stack>
  );
}

function ValueSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Stack direction={"row"} alignItems={"center"} gap={2} sx={{ width: 260 }}>
      <Slider
        size={"small"}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(_, v) => onChange(v as number)}
      />
      <Typography variant={"body2"} sx={{ width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {percent(value)}
      </Typography>
    </Stack>
  );
}

function CursorSettings() {
  const { t } = useTranslation();
  const { replayCursorSettingsStore, analysisCursorSettingsStore } = useCommonManagers();
  const replay = useObservable(() => replayCursorSettingsStore.settings$, DEFAULT_REPLAY_CURSOR_SETTINGS);
  const analysis = useObservable(() => analysisCursorSettingsStore.settings$, DEFAULT_ANALYSIS_CURSOR_SETTINGS);

  return (
    <Section title={t("settings.sectionCursor")}>
      <Row label={t("settings.replayCursor")}>
        <Switch
          checked={replay.enabled}
          onChange={(e) => replayCursorSettingsStore.changeSettings((s) => (s.enabled = e.target.checked))}
        />
      </Row>
      <Row label={t("settings.smoothTrail")} disabled={!replay.enabled}>
        <Switch
          checked={replay.smoothCursorTrail}
          disabled={!replay.enabled}
          onChange={(e) => replayCursorSettingsStore.changeSettings((s) => (s.smoothCursorTrail = e.target.checked))}
        />
      </Row>
      <Row label={t("settings.cursorScale")} disabled={!replay.enabled}>
        <ValueSlider
          value={Math.round(replay.scale * 100)}
          min={10}
          max={200}
          disabled={!replay.enabled}
          onChange={(v) => replayCursorSettingsStore.changeSettings((s) => (s.scale = v / 100))}
        />
      </Row>
      <Row label={t("settings.analysisCursor")} description={t("settings.analysisCursorHint")}>
        <Switch checked={analysis.enabled} onChange={(e) => analysisCursorSettingsStore.setEnabled(e.target.checked)} />
      </Row>
    </Section>
  );
}

function PlayfieldSettings() {
  const { t } = useTranslation();
  const { beatmapBackgroundSettingsStore, hitErrorBarSettingsStore } = useCommonManagers();
  const background = useObservable(() => beatmapBackgroundSettingsStore.settings$, {
    blur: 0,
    enabled: false,
    dim: 0,
  });
  const hitErrorBar = useObservable(() => hitErrorBarSettingsStore.settings$, DEFAULT_HIT_ERROR_BAR_SETTINGS);

  return (
    <Section title={t("settings.sectionPlayfield")}>
      <Row label={t("settings.backgroundDim")}>
        <ValueSlider
          value={Math.round(background.dim * 100)}
          onChange={(v) => beatmapBackgroundSettingsStore.setDim(v / 100)}
        />
      </Row>
      <Row label={t("settings.backgroundBlur")}>
        <ValueSlider
          value={Math.round(background.blur * 100)}
          onChange={(v) => beatmapBackgroundSettingsStore.setBlur(v / 100)}
        />
      </Row>
      <Row label={t("settings.hitErrorBarScale")}>
        <ValueSlider
          value={Math.round(hitErrorBar.scale * 100)}
          max={300}
          onChange={(v) => hitErrorBarSettingsStore.changeSettings((s) => (s.scale = v / 100))}
        />
      </Row>
    </Section>
  );
}

function PlaybarAndAdvancedSettings() {
  const { t } = useTranslation();
  const { playbarSettingsStore, beatmapRenderSettingsStore } = useCommonManagers();
  const playbar = useObservable(() => playbarSettingsStore.settings$, DEFAULT_PLAY_BAR_SETTINGS);
  const render = useObservable(() => beatmapRenderSettingsStore.settings$, DEFAULT_BEATMAP_RENDER_SETTINGS);

  return (
    <>
      <Section title={t("settings.playbar")}>
        <Row label={t("settings.difficultyGraph")}>
          <Switch
            checked={playbar.difficultyGraphEnabled}
            onChange={(e) => playbarSettingsStore.changeSettings((s) => (s.difficultyGraphEnabled = e.target.checked))}
          />
        </Row>
      </Section>
      <Section title={t("settings.sectionAdvanced")}>
        <Row label={t("settings.sliderDevMode")} description={t("settings.sliderDevModeHint")}>
          <Switch
            checked={render.sliderDevMode}
            onChange={(e) => beatmapRenderSettingsStore.setSliderDevMode(e.target.checked)}
          />
        </Row>
      </Section>
    </>
  );
}

function GameplaySettings() {
  return (
    <Stack gap={3}>
      <CursorSettings />
      <PlayfieldSettings />
      <PlaybarAndAdvancedSettings />
    </Stack>
  );
}

function SkinsSettings() {
  const { t } = useTranslation();
  const theater = useCommonManagers();

  const { preferredSkinId } = useObservable(() => theater.skinSettingsStore.settings$, DEFAULT_SKIN_SETTINGS);
  const chosenSkinId = stringToSkinId(preferredSkinId);
  const skins = useObservable(() => theater.skinManager.skinList$, []);
  const [error, setError] = useState<string | null>(null);

  const skinOptions: SkinId[] = useMemo(
    () =>
      [DEFAULT_OSU_SKIN_ID, DEFAULT_YUGEN_SKIN_ID].concat(
        [...skins].sort((a, b) => a.localeCompare(b)).map((name) => ({ source: "osu" as SkinSource, name })),
      ),
    [skins],
  );

  useEffect(() => {
    void theater.skinManager.loadSkinList();
  }, [theater]);

  const handleSkinChange = useCallback(
    async (skinId: SkinId) => {
      setError(null);
      try {
        await theater.skinManager.loadSkin(skinId);
      } catch (e) {
        console.error(`Could not load skin ${skinId.name}`, e);
        setError(t("settings.skinError", { name: skinId.name }));
      }
    },
    [theater, t],
  );

  return (
    <Stack gap={3}>
      <Section title={t("settings.skin")}>
        <Box sx={{ p: 2 }}>
          <Autocomplete
            options={skinOptions}
            groupBy={(option: SkinId) => t(sourceNameKey[option.source])}
            value={chosenSkinId}
            onChange={(_, newValue) => newValue && void handleSkinChange(newValue as SkinId)}
            getOptionLabel={(option: SkinId) => option.name}
            fullWidth
            renderInput={(params) => <TextField {...params} label={t("settings.skin")} />}
            isOptionEqualToValue={(option, value) => option.name === value.name && option.source === value.source}
          />
          <Stack direction={"row"} alignItems={"center"} gap={2} sx={{ mt: 1.5 }}>
            <Typography variant={"caption"} color={"text.secondary"} sx={{ flex: 1 }}>
              {t("settings.skinHint", { count: skins.length })}
            </Typography>
            <Button size={"small"} onClick={() => void theater.skinManager.loadSkinList()}>
              {t("settings.skinRefresh")}
            </Button>
          </Stack>
          {error && (
            <Typography variant={"body2"} color={"error"} sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
        </Box>
      </Section>
    </Stack>
  );
}

function OtherSettings() {
  const { t, language, setLanguage } = useTranslation();
  const [confirmReset, setConfirmReset] = useState(false);
  const resetSettings = useCallback(() => {
    localStorage.clear();
    frontendAPI.reboot();
  }, []);

  return (
    <Stack gap={3}>
      <Section title={t("language.label")}>
        <Row label={t("language.label")}>
          <ToggleButtonGroup
            exclusive
            size={"small"}
            value={language}
            onChange={(_, value: Language | null) => value && setLanguage(value)}
          >
            {LANGUAGES.map((l) => (
              <ToggleButton key={l.id} value={l.id} sx={{ textTransform: "none", px: 2 }}>
                {l.name}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Row>
      </Section>
      <Section title={t("settings.sectionReset")}>
        <Row label={t("settings.reset")} description={t("settings.resetHint")}>
          <Button variant={"outlined"} color={"error"} onClick={() => setConfirmReset(true)}>
            {t("settings.resetButton")}
          </Button>
        </Row>
      </Section>
      <Dialog open={confirmReset} onClose={() => setConfirmReset(false)}>
        <DialogTitle>{t("settings.resetConfirmTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t("settings.resetHint")}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReset(false)}>{t("col.cancel")}</Button>
          <Button variant={"contained"} color={"error"} onClick={resetSettings}>
            {t("settings.resetButton")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export function SettingsModal() {
  const { onSettingsModalOpenChange, settingsModalOpen, opacity, onTabIndexChange, onOpacityChange, tabIndex } =
    useSettingsModalContext();
  const onClose = () => onSettingsModalOpenChange(false);
  const { t } = useTranslation();

  return (
    <Modal
      open={settingsModalOpen}
      onClose={onClose}
      sx={{
        "& .MuiBackdrop-root": {
          backgroundColor: "rgba(0,0,0,0.25)",
        },
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(880px, 94vw)",
          height: "min(640px, 90vh)",
          outline: "none",
        }}
      >
        <BaseSettingsModal
          opacity={opacity}
          tabIndex={tabIndex}
          onTabIndexChange={onTabIndexChange}
          onOpacityChange={onOpacityChange}
          onClose={onClose}
          tabs={[
            { label: t("settings.tabGame"), icon: <SportsEsports />, component: <GameplaySettings /> },
            { label: t("settings.tabSkins"), icon: <Brush />, component: <SkinsSettings /> },
            { label: t("settings.tabOther"), icon: <Tune />, component: <OtherSettings /> },
          ]}
        />
      </Box>
    </Modal>
  );
}
