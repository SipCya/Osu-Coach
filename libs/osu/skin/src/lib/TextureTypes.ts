export const defaultDigitFonts = [
  "DEFAULT_0",
  "DEFAULT_1",
  "DEFAULT_2",
  "DEFAULT_3",
  "DEFAULT_4",
  "DEFAULT_5",
  "DEFAULT_6",
  "DEFAULT_7",
  "DEFAULT_8",
  "DEFAULT_9",
] as const;
type DefaultDigitFont = typeof defaultDigitFonts[number];
export const comboDigitFonts = [
  "COMBO_0",
  "COMBO_1",
  "COMBO_2",
  "COMBO_3",
  "COMBO_4",
  "COMBO_5",
  "COMBO_6",
  "COMBO_7",
  "COMBO_8",
  "COMBO_9",
] as const;
type ComboDigitFont = typeof comboDigitFonts[number];
export const hitCircleDigitFonts = [
  "HIT_CIRCLE_0",
  "HIT_CIRCLE_1",
  "HIT_CIRCLE_2",
  "HIT_CIRCLE_3",
  "HIT_CIRCLE_4",
  "HIT_CIRCLE_5",
  "HIT_CIRCLE_6",
  "HIT_CIRCLE_7",
  "HIT_CIRCLE_8",
  "HIT_CIRCLE_9",
] as const;
type HitCircleDigitFont = typeof hitCircleDigitFonts[number];

type HitCircleTextures = "APPROACH_CIRCLE" | "HIT_CIRCLE" | "HIT_CIRCLE_OVERLAY";
type SliderTextures = "SLIDER_BALL" | "SLIDER_FOLLOW_CIRCLE" | "SLIDER_TICK" | "SLIDER_REPEAT";
type SpinnerTextures =
  | "SPINNER_APPROACH_CIRCLE"
  | "SPINNER_BACKGROUND"
  | "SPINNER_BOTTOM"
  | "SPINNER_CIRCLE"
  | "SPINNER_CLEAR"
  | "SPINNER_GLOW"
  | "SPINNER_MIDDLE2"
  | "SPINNER_MIDDLE"
  | "SPINNER_OSU"
  | "SPINNER_RPM"
  | "SPINNER_SPIN"
  | "SPINNER_TOP";
type JudgementTextures = "HIT_0" | "HIT_50" | "HIT_100" | "HIT_100K" | "HIT_300" | "HIT_300K";
type CursorTextures = "CURSOR" | "CURSOR_TRAIL";
type ScoreTextures = "SCORE_X" | "SCORE_DOT" | "SCORE_PERCENT";
export type OsuSkinTextures =
  | HitCircleTextures
  | SliderTextures
  | SpinnerTextures
  | JudgementTextures
  | CursorTextures
  | DefaultDigitFont
  | ComboDigitFont
  | HitCircleDigitFont
  | ScoreTextures;
