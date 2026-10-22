import { createTheme } from "@mui/material";

// One cohesive dark theme for the whole app. Individual screens still hardcode the same pink
// accent in a few places, but routing the MUI defaults through here keeps everything consistent
// (buttons, toggles, sliders, inputs, surfaces) without touching any layout or behaviour.
const ACCENT = "#ff66aa";
const ACCENT_DARK = "#e0558f";
const ACCENT_LIGHT = "#ff93c2";

const BG = "#141419";
const SURFACE = "#1d1d26";
const SURFACE_2 = "#23232e";
const BORDER = "rgba(255,255,255,0.09)";
const TEXT = "#ececf2";
const TEXT_DIM = "#9a9aa8";

export const appTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: ACCENT, dark: ACCENT_DARK, light: ACCENT_LIGHT, contrastText: "#15151b" },
    secondary: { main: "#5cc8ff", contrastText: "#15151b" },
    success: { main: "#5ad18a" },
    warning: { main: "#ffb347" },
    error: { main: "#ff5c5c" },
    info: { main: "#5cc8ff" },
    background: { default: BG, paper: SURFACE },
    text: { primary: TEXT, secondary: TEXT_DIM },
    divider: BORDER,
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: ["system-ui", '"Segoe UI"', "Roboto", "Arial", "sans-serif"].join(","),
    button: { textTransform: "none", fontWeight: 600 },
    h6: { fontWeight: 800, letterSpacing: "-0.01em" },
    subtitle1: { fontWeight: 700 },
    subtitle2: { fontWeight: 700 },
  },
  components: {
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: BG },
        "*::-webkit-scrollbar": { width: 10, height: 10 },
        "*::-webkit-scrollbar-thumb": {
          backgroundColor: "rgba(255,255,255,0.14)",
          borderRadius: 8,
          border: "2px solid transparent",
          backgroundClip: "padding-box",
        },
        "*::-webkit-scrollbar-thumb:hover": { backgroundColor: "rgba(255,255,255,0.24)" },
        "*::-webkit-scrollbar-corner": { background: "transparent" },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8 },
        containedPrimary: { "&:hover": { backgroundColor: ACCENT_DARK } },
      },
    },
    MuiPaper: {
      styleOverrides: {
        // Flat surfaces (no MUI elevation gradient) read cleaner on a dark UI.
        root: { backgroundImage: "none" },
        outlined: { borderColor: BORDER },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          borderColor: BORDER,
          "&.Mui-selected": {
            backgroundColor: "rgba(255,102,170,0.16)",
            color: ACCENT_LIGHT,
            "&:hover": { backgroundColor: "rgba(255,102,170,0.24)" },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600 } },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#0c0c10",
          border: `1px solid ${BORDER}`,
          fontSize: "0.78rem",
          padding: "6px 10px",
          borderRadius: 8,
        },
        arrow: { color: "#0c0c10" },
      },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 14, backgroundColor: SURFACE_2, border: `1px solid ${BORDER}` } },
    },
    MuiMenu: {
      styleOverrides: { paper: { borderRadius: 10, border: `1px solid ${BORDER}`, backgroundColor: SURFACE_2 } },
    },
    MuiPopover: {
      styleOverrides: { paper: { borderRadius: 10, border: `1px solid ${BORDER}` } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 8 },
        notchedOutline: { borderColor: BORDER },
      },
    },
    MuiSlider: {
      styleOverrides: {
        thumb: {
          "&:hover, &.Mui-focusVisible": { boxShadow: "0 0 0 6px rgba(255,102,170,0.16)" },
        },
      },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: BORDER } },
    },
  },
});
