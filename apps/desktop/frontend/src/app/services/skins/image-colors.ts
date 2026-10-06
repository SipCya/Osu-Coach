export interface ColorAdjust {
  hue: number;
  saturation: number;
  brightness: number;
  tint: string | null;
}

export const NO_ADJUST: ColorAdjust = { hue: 0, saturation: 1, brightness: 0, tint: null };

export function isNoAdjust(a: ColorAdjust) {
  return a.hue === 0 && a.saturation === 1 && a.brightness === 0 && !a.tint;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hueToRgb(p: number, q: number, t: number) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
}

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function adjustPixels(pixels: Uint8ClampedArray, adjust: ColorAdjust): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels);
  if (isNoAdjust(adjust)) return out;
  const tint = adjust.tint ? parseHex(adjust.tint) : null;
  const hueShift = adjust.hue / 360;

  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    let r0 = out[i] / 255;
    let g0 = out[i + 1] / 255;
    let b0 = out[i + 2] / 255;
    if (tint) {
      r0 *= tint[0];
      g0 *= tint[1];
      b0 *= tint[2];
    }
    let [h, s, l] = rgbToHsl(r0, g0, b0);
    h = (h + hueShift + 1) % 1;
    s = clamp01(s * adjust.saturation);
    l = clamp01(l + adjust.brightness);
    const [r, g, b] = hslToRgb(h, s, l);
    out[i] = Math.round(r * 255);
    out[i + 1] = Math.round(g * 255);
    out[i + 2] = Math.round(b * 255);
  }
  return out;
}
