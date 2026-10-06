export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];
export type Color = RGB | RGBA;

export type SkinConfig = {
  general: {
    name: string;
    author: string;
    version: string;
    animationFrameRate: number | undefined;
    allowSliderBallTint: boolean;
    comboBurstRandom: boolean;
    cursorCenter: boolean;
    cursorExpand: boolean;
    cursorRotate: boolean;
    cursorTrailRotate: boolean;
    customComboBurstSounds: number[];
    hitCircleOverlayAboveNumber: boolean;
    layeredHitSounds: boolean;
    sliderBallFlip: boolean;
    spinnerFadePlayfield: boolean;
    spinnerFrequencyModulate: boolean;
    spinnerNoBlink: boolean;
  };
  colors: {
    comboColors: Color[];
    inputOverlayText: Color;
    menuGlow: Color;
    sliderBall: Color;
    sliderBorder: Color;
    sliderTrackOverride: Color | undefined;
    songSelectActiveText: Color;
    songSelectInactiveText: Color;
    spinnerBackground: Color;
    starBreakAdditive: Color;
  };
  fonts: {
    hitCirclePrefix: string;
    hitCircleOverlap: number;
    scorePrefix: string;
    scoreOverlap: number;
    comboPrefix: string;
    comboOverlap: number;
  };
};

export enum SkinIniSection {
  NONE,
  GENERAL,
  COLORS,
  FONTS,
}

export const generateDefaultSkinConfig = (didFileExist: boolean): SkinConfig => ({
  general: {
    name: "",
    author: "",
    version: didFileExist ? "1.0" : "latest",
    animationFrameRate: undefined,
    allowSliderBallTint: false,
    comboBurstRandom: false,
    cursorCenter: true,
    cursorExpand: true,
    cursorRotate: true,
    cursorTrailRotate: true,
    customComboBurstSounds: [],
    hitCircleOverlayAboveNumber: true,
    layeredHitSounds: true,
    sliderBallFlip: true,
    spinnerFadePlayfield: false,
    spinnerFrequencyModulate: true,
    spinnerNoBlink: false,
  },
  colors: {
    comboColors: [
      [255, 192, 0],
      [0, 202, 0],
      [18, 124, 255],
      [242, 24, 57],
    ],
    inputOverlayText: [0, 0, 0],
    menuGlow: [0, 78, 155],
    sliderBall: [2, 170, 255],
    sliderBorder: [255, 255, 255],
    sliderTrackOverride: undefined,
    songSelectActiveText: [0, 0, 0],
    songSelectInactiveText: [255, 255, 255],
    spinnerBackground: [100, 100, 100],
    starBreakAdditive: [255, 182, 193],
  },
  fonts: {
    hitCirclePrefix: "default",
    hitCircleOverlap: -2,
    scorePrefix: "score",
    scoreOverlap: -2,
    comboPrefix: "score",
    comboOverlap: -2,
  },
});
