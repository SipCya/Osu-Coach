import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { TranslationKey, useTranslation } from "../../i18n";
import { AimResult, AimSettings, beatInterval, DEFAULT_AIM_SETTINGS } from "../../services/trainer/aim-session";
import {
  DEFAULT_SLIDER_SETTINGS,
  SliderResult,
  SliderSettings,
  SliderShape,
} from "../../services/trainer/slider-session";
import { accuracy, arToPreempt, csToRadius, mean } from "../../services/trainer/trainer-math";
import { DEFAULT_KEYS, keyLabel, Playfield, TrainerOutcome, TrainerRun } from "./Playfield";
import { ACCENT } from "./draw";

type Mode = "aim" | "slider";

const STORAGE_KEY = "osucoach-trainer";
const PINK_BUTTON = {
  backgroundColor: ACCENT,
  color: "#15151b",
  fontWeight: 700,
  "&:hover": { backgroundColor: "#ff85bb" },
};
const DURATIONS = [30, 60, 120, 300];
const SHAPES: { value: SliderShape; label: TranslationKey }[] = [
  { value: "mixed", label: "tr.shape.mixed" },
  { value: "linear", label: "tr.shape.linear" },
  { value: "curve", label: "tr.shape.curve" },
  { value: "wave", label: "tr.shape.wave" },
];

interface Saved {
  mode: Mode;
  aim: AimSettings;
  slider: SliderSettings;
  keys: string[];
}

function loadSaved(): Saved {
  const defaults: Saved = {
    mode: "aim",
    aim: DEFAULT_AIM_SETTINGS,
    slider: DEFAULT_SLIDER_SETTINGS,
    keys: DEFAULT_KEYS,
  };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as Partial<Saved>;
    return {
      mode: saved.mode === "slider" ? "slider" : "aim",
      aim: {
        ...DEFAULT_AIM_SETTINGS,
        ...saved.aim,
        ...((saved.aim as { rhythm?: string } | undefined)?.rhythm === "bpm" ? { waitForClick: false } : {}),
      },
      slider: { ...DEFAULT_SLIDER_SETTINGS, ...saved.slider },
      keys:
        Array.isArray(saved.keys) && saved.keys.length === 2 && saved.keys.every((k) => typeof k === "string")
          ? saved.keys
          : DEFAULT_KEYS,
    };
  } catch {
    return defaults;
  }
}

function save(saved: Saved): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

function SettingSlider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <Box sx={{ opacity: disabled ? 0.5 : 1 }}>
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
        disabled={disabled}
        sx={{ color: ACCENT }}
      />
    </Box>
  );
}

function DurationSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useTranslation();
  return (
    <TextField
      select
      size={"small"}
      label={t("tr.duration")}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {DURATIONS.map((d) => (
        <MenuItem key={d} value={d}>
          {d < 60 ? `${d} s` : `${d / 60} min`}
        </MenuItem>
      ))}
    </TextField>
  );
}

function AimSettingsForm({ value, onChange }: { value: AimSettings; onChange: (v: AimSettings) => void }) {
  const { t } = useTranslation();
  const set = (partial: Partial<AimSettings>) => onChange({ ...value, ...partial });
  return (
    <Stack gap={1.5}>
      <SettingSlider
        label={t("tr.size")}
        value={value.cs}
        display={`CS ${value.cs.toFixed(1)} · ${t("tr.radius", { px: Math.round(csToRadius(value.cs)) })}`}
        min={0}
        max={10}
        step={0.1}
        onChange={(cs) => set({ cs })}
      />
      <SettingSlider
        label={t("tr.speed")}
        value={value.ar}
        display={`AR ${value.ar.toFixed(1)} · ${t("tr.preempt", { ms: Math.round(arToPreempt(value.ar)) })}`}
        min={0}
        max={10}
        step={0.1}
        onChange={(ar) => set({ ar })}
      />
      <Box>
        <Stack direction={"row"} justifyContent={"space-between"}>
          <Typography variant={"body2"} sx={{ fontWeight: 600 }}>
            {t("tr.distance")}
          </Typography>
          <Typography variant={"body2"} color={"text.secondary"}>
            {value.minDistance}–{value.maxDistance} px
          </Typography>
        </Stack>
        <Slider
          size={"small"}
          value={[value.minDistance, value.maxDistance]}
          min={0}
          max={600}
          step={10}
          onChange={(_, v) => {
            const [minDistance, maxDistance] = v as number[];
            set({ minDistance, maxDistance });
          }}
          sx={{ color: ACCENT }}
        />
      </Box>
      <SettingSlider
        label={t("tr.sizeVariation")}
        value={value.sizeVariation}
        display={value.sizeVariation === 0 ? t("tr.off") : `±${Math.round(value.sizeVariation * 100)}%`}
        min={0}
        max={0.6}
        step={0.05}
        onChange={(sizeVariation) => set({ sizeVariation })}
      />
      <Box>
        <FormControlLabel
          control={
            <Checkbox
              checked={value.waitForClick}
              onChange={(e) => set({ waitForClick: e.target.checked })}
              sx={{ color: ACCENT, "&.Mui-checked": { color: ACCENT } }}
            />
          }
          label={t("tr.waitForClick")}
        />
        <Typography variant={"caption"} color={"text.secondary"} sx={{ display: "block", ml: 4 }}>
          {t(value.waitForClick ? "tr.waitForClickOn" : "tr.waitForClickOff")}
        </Typography>
      </Box>
      <Box>
        <Stack direction={"row"} gap={2} alignItems={"flex-end"}>
          <Box sx={{ flex: 1 }}>
            <SettingSlider
              label={"BPM"}
              value={value.bpm}
              display={t("tr.bpmDisplay", {
                bpm: value.bpm,
                ms: Math.round(beatInterval(value)),
                perSecond: (1000 / beatInterval(value)).toFixed(1),
              })}
              min={40}
              max={320}
              step={5}
              onChange={(bpm) => set({ bpm })}
            />
          </Box>
          <TextField
            select
            size={"small"}
            label={t("tr.divisor")}
            value={value.divisor}
            onChange={(e) => set({ divisor: Number(e.target.value) })}
            sx={{ minWidth: 120 }}
          >
            {[1, 2, 4].map((d) => (
              <MenuItem key={d} value={d}>
                1/{d}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Box>
      <DurationSelect value={value.durationSec} onChange={(durationSec) => set({ durationSec })} />
    </Stack>
  );
}

function SliderSettingsForm({ value, onChange }: { value: SliderSettings; onChange: (v: SliderSettings) => void }) {
  const { t } = useTranslation();
  const set = (partial: Partial<SliderSettings>) => onChange({ ...value, ...partial });
  return (
    <Stack gap={1.5}>
      <SettingSlider
        label={t("tr.size")}
        value={value.cs}
        display={`CS ${value.cs.toFixed(1)} · ${t("tr.radius", { px: Math.round(csToRadius(value.cs)) })}`}
        min={0}
        max={10}
        step={0.1}
        onChange={(cs) => set({ cs })}
      />
      <SettingSlider
        label={t("tr.ballSpeed")}
        value={value.velocity}
        display={`${value.velocity} px/s`}
        min={80}
        max={800}
        step={10}
        onChange={(velocity) => set({ velocity })}
      />
      <SettingSlider
        label={t("tr.sliderLength")}
        value={value.length}
        display={`${value.length} px`}
        min={60}
        max={450}
        step={10}
        onChange={(length) => set({ length })}
      />
      <SettingSlider
        label={t("tr.jump")}
        value={value.jumpDistance}
        display={`${value.jumpDistance} px`}
        min={0}
        max={350}
        step={10}
        onChange={(jumpDistance) => set({ jumpDistance })}
      />
      <SettingSlider
        label={t("tr.speed")}
        value={value.ar}
        display={`AR ${value.ar.toFixed(1)} · ${t("tr.preempt", { ms: Math.round(arToPreempt(value.ar)) })}`}
        min={0}
        max={10}
        step={0.1}
        onChange={(ar) => set({ ar })}
      />
      <Stack direction={"row"} gap={2}>
        <TextField
          select
          size={"small"}
          label={t("tr.shape")}
          value={value.shape}
          onChange={(e) => set({ shape: e.target.value as SliderShape })}
          sx={{ flex: 1 }}
        >
          {SHAPES.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {t(s.label)}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <DurationSelect value={value.durationSec} onChange={(durationSec) => set({ durationSec })} />
        </Box>
      </Stack>
    </Stack>
  );
}

function KeyBindings({ keys, onChange }: { keys: string[]; onChange: (keys: string[]) => void }) {
  const { t } = useTranslation();
  const [listening, setListening] = useState<number | null>(null);

  useEffect(() => {
    if (listening === null) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== "Escape" && e.code) {
        const next = [...keys];
        const other = 1 - listening;
        if (next[other] === e.code) next[other] = next[listening];
        next[listening] = e.code;
        onChange(next);
      }
      setListening(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, keys, onChange]);

  return (
    <Stack direction={"row"} gap={1.5} alignItems={"center"} flexWrap={"wrap"}>
      <Typography variant={"body2"} sx={{ fontWeight: 600 }}>
        {t("tr.keys")}
      </Typography>
      {keys.map((code, i) => (
        <Button
          key={i}
          variant={listening === i ? "contained" : "outlined"}
          onClick={() => setListening(listening === i ? null : i)}
          sx={{
            minWidth: 64,
            ...(listening === i ? PINK_BUTTON : { color: "text.primary", borderColor: "divider" }),
            fontWeight: 800,
          }}
        >
          {listening === i ? t("tr.keyPress") : keyLabel(code)}
        </Button>
      ))}
      <Button size={"small"} onClick={() => onChange(DEFAULT_KEYS)} disabled={keys.join() === DEFAULT_KEYS.join()}>
        {t("tr.keysReset")}
      </Button>
      <Typography variant={"caption"} color={"text.secondary"}>
        {t("tr.keysHint")}
      </Typography>
    </Stack>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 130 }}>
      <Typography variant={"caption"} color={"text.secondary"}>
        {label}
      </Typography>
      <Typography variant={"h5"} sx={{ fontWeight: 800 }}>
        {value}
      </Typography>
    </Box>
  );
}

function ClickScatter({ results }: { results: AimResult[] }) {
  const { t } = useTranslation();
  const hits = results.filter((r) => r.along !== undefined && r.across !== undefined);
  const size = 240;
  const c = size / 2;
  const r = size / 2 - 12;
  const along = mean(hits.map((h) => h.along ?? 0));
  const across = mean(hits.map((h) => h.across ?? 0));
  return (
    <Stack alignItems={"center"} gap={0.5}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role={"img"} aria-label={t("tr.scatterTitle")}>
        <circle cx={c} cy={c} r={r} fill={"rgba(255,102,170,0.15)"} stroke={"white"} strokeWidth={2} />
        <circle cx={c} cy={c} r={(r * 2) / 3} fill={"none"} stroke={"rgba(255,255,255,0.3)"} />
        <circle cx={c} cy={c} r={r / 3} fill={"none"} stroke={"rgba(255,255,255,0.3)"} />
        <line x1={c} y1={c + r} x2={c} y2={c - r} stroke={"rgba(255,255,255,0.15)"} />
        <line x1={c - r} y1={c} x2={c + r} y2={c} stroke={"rgba(255,255,255,0.15)"} />
        {hits.map((h, i) => (
          <circle
            key={i}
            cx={c + (h.across ?? 0) * r}
            cy={c - (h.along ?? 0) * r}
            r={3}
            fill={"#66ccff"}
            opacity={0.7}
          />
        ))}
        {hits.length > 0 && (
          <circle cx={c + across * r} cy={c - along * r} r={6} fill={ACCENT} stroke={"white"} strokeWidth={2} />
        )}
        <text x={c} y={10} textAnchor={"middle"} fill={"rgba(255,255,255,0.6)"} fontSize={11}>
          ↑ {t("tr.jumpDirection")}
        </text>
      </svg>
      <Typography variant={"caption"} color={"text.secondary"}>
        {t("tr.scatterLegend")}
      </Typography>
    </Stack>
  );
}

function aimTendency(results: AimResult[], t: (k: TranslationKey, p?: Record<string, string | number>) => string) {
  const hits = results.filter((r) => r.along !== undefined);
  if (hits.length < 5) return t("tr.tendencyFew");
  const along = mean(hits.map((h) => h.along ?? 0));
  const across = mean(hits.map((h) => h.across ?? 0));
  const parts: string[] = [];
  if (along > 0.12) parts.push(t("tr.tendencyOver", { pct: Math.round(along * 100) }));
  else if (along < -0.12) parts.push(t("tr.tendencyUnder", { pct: Math.round(-along * 100) }));
  if (Math.abs(across) > 0.12)
    parts.push(
      t("tr.tendencySide", {
        pct: Math.round(Math.abs(across) * 100),
        side: across > 0 ? "@m.side.right" : "@m.side.left",
      }),
    );
  return parts.length > 0 ? parts.join(" ") : t("tr.tendencyCentered");
}

function Summary({ outcome, onRetry, onBack }: { outcome: TrainerOutcome; onRetry: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  let content: React.ReactNode;
  if (outcome.mode === "aim") {
    const results = outcome.results;
    const judgements = results.map((r) => r.judgement);
    const count = (j: number) => judgements.filter((x) => x === j).length;
    const hits = results.filter((r) => r.judgement > 0);
    const timed = hits.filter((h) => h.timingMs !== undefined);
    const timing = Math.round(mean(timed.map((h) => h.timingMs ?? 0)));
    content = (
      <Stack direction={{ xs: "column", md: "row" }} gap={4} alignItems={"center"}>
        <Stack gap={2} sx={{ flex: 1 }}>
          <Stack direction={"row"} gap={3} flexWrap={"wrap"}>
            <Stat label={t("tr.accuracy")} value={`${(accuracy(judgements) * 100).toFixed(2)}%`} />
            <Stat label={t("tr.targets")} value={String(results.length)} />
            <Stat
              label={t("tr.avgDistance")}
              value={hits.length ? `${Math.round(mean(hits.map((h) => h.distanceRatio ?? 0)) * 100)}%` : "–"}
            />
            {timed.length > 0 ? (
              <Stat label={t(timing < 0 ? "tr.timingEarly" : "tr.timingLate")} value={`${Math.abs(timing)} ms`} />
            ) : (
              <Stat
                label={t("tr.reaction")}
                value={hits.length ? `${Math.round(mean(hits.map((h) => h.reactionMs)))} ms` : "–"}
              />
            )}
          </Stack>
          <Typography color={"text.secondary"}>
            300: {count(300)} · 100: {count(100)} · 50: {count(50)} · {t("tr.misses")}: {count(0)}
          </Typography>
          <Typography>{aimTendency(results, t)}</Typography>
        </Stack>
        <ClickScatter results={results} />
      </Stack>
    );
  } else {
    const results = outcome.results;
    const perfect = results.filter((r) => r.tracked >= 0.99).length;
    content = (
      <Stack direction={"row"} gap={3} flexWrap={"wrap"}>
        <Stat label={t("tr.tracked")} value={`${(mean(results.map((r) => r.tracked)) * 100).toFixed(1)}%`} />
        <Stat label={t("tr.sliders")} value={String(results.length)} />
        <Stat label={t("tr.perfectSliders")} value={String(perfect)} />
        <Stat
          label={t("tr.avgBallDistance")}
          value={results.length ? `${Math.round(mean(results.map((r) => r.averageDistance)) * 100)}%` : "–"}
        />
      </Stack>
    );
  }
  return (
    <Paper elevation={1} sx={{ p: 3, borderRadius: 3, boxShadow: "none" }}>
      <Typography variant={"h5"} sx={{ fontWeight: 800, mb: 2 }}>
        {t("tr.results")}
      </Typography>
      {content}
      <Stack direction={"row"} gap={1.5} sx={{ mt: 3 }}>
        <Button variant={"contained"} onClick={onRetry} sx={PINK_BUTTON}>
          {t("tr.retry")}
        </Button>
        <Button onClick={onBack}>{t("tr.changeSettings")}</Button>
      </Stack>
    </Paper>
  );
}

export function AimTrainer() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [run, setRun] = useState<TrainerRun | null>(null);
  const [outcome, setOutcome] = useState<TrainerOutcome | null>(null);

  const update = (next: Saved) => {
    setSaved(next);
    save(next);
  };
  const start = () => {
    setOutcome(null);
    setRun(
      saved.mode === "aim"
        ? { mode: "aim", settings: saved.aim, keys: saved.keys }
        : { mode: "slider", settings: saved.slider, keys: saved.keys },
    );
  };

  if (run) {
    return (
      <Box sx={{ position: "relative", height: "100%" }}>
        <Playfield
          run={run}
          onFinish={(o) => {
            setRun(null);
            setOutcome(o);
          }}
          onCancel={() => setRun(null)}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", overflowY: "auto", p: 2 }}>
      <Stack gap={2} sx={{ maxWidth: 900, mx: "auto" }}>
        {outcome && <Summary outcome={outcome} onRetry={start} onBack={() => setOutcome(null)} />}
        {!outcome && (
          <Paper elevation={1} sx={{ p: 3, borderRadius: 3, boxShadow: "none" }}>
            <Typography variant={"h5"} sx={{ fontWeight: 800 }}>
              {t("tr.title")}
            </Typography>
            <Typography color={"text.secondary"} sx={{ mt: 0.5, mb: 2 }}>
              {t(saved.mode === "aim" ? "tr.introAim" : "tr.introSlider")}
            </Typography>
            <ToggleButtonGroup
              exclusive
              size={"small"}
              value={saved.mode}
              onChange={(_, mode: Mode | null) => mode && update({ ...saved, mode })}
              sx={{ mb: 2.5 }}
            >
              <ToggleButton value={"aim"} sx={{ textTransform: "none", px: 3, fontWeight: 700 }}>
                {t("tr.modeAim")}
              </ToggleButton>
              <ToggleButton value={"slider"} sx={{ textTransform: "none", px: 3, fontWeight: 700 }}>
                {t("tr.modeSlider")}
              </ToggleButton>
            </ToggleButtonGroup>
            {saved.mode === "aim" ? (
              <AimSettingsForm value={saved.aim} onChange={(aim) => update({ ...saved, aim })} />
            ) : (
              <SliderSettingsForm value={saved.slider} onChange={(slider) => update({ ...saved, slider })} />
            )}
            <Box sx={{ mt: 2.5 }}>
              <KeyBindings keys={saved.keys} onChange={(keys) => update({ ...saved, keys })} />
            </Box>
            <Stack direction={"row"} gap={2} alignItems={"center"} sx={{ mt: 3 }}>
              <Button variant={"contained"} size={"large"} onClick={start} sx={PINK_BUTTON}>
                {t("tr.start")}
              </Button>
              <Typography variant={"body2"} color={"text.secondary"}>
                {t("tr.controls", { key1: keyLabel(saved.keys[0]), key2: keyLabel(saved.keys[1]) })}
              </Typography>
            </Stack>
          </Paper>
        )}
      </Stack>
    </Box>
  );
}
