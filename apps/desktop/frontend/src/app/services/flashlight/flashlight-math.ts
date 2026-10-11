export interface FlashlightLook {
  radius: number;
  darkness: number;
  softness: number;
}

export interface FlashlightSettings extends FlashlightLook {
  displayId: number;
  comboShrink: boolean;
  onlyWhilePlaying: boolean;
}

export const DEFAULT_FLASHLIGHT_SETTINGS: FlashlightSettings = {
  displayId: 0,
  radius: 0.28,
  darkness: 1,
  softness: 0.35,
  comboShrink: false,
  onlyWhilePlaying: false,
};

export const COMBO_STEPS: { combo: number; scale: number }[] = [
  { combo: 200, scale: 0.75 },
  { combo: 100, scale: 0.875 },
];

export function comboScale(combo: number, enabled: boolean): number {
  if (!enabled) return 1;
  return COMBO_STEPS.find((step) => combo >= step.combo)?.scale ?? 1;
}

export function holeRadiusPx(look: FlashlightLook, screenHeight: number, combo = 0, comboShrink = false): number {
  return look.radius * screenHeight * comboScale(combo, comboShrink);
}

export const OSU_REFERENCE_HEIGHT = 768;

export function cursorImageGeometry(look: FlashlightLook, aspect: number) {
  const halfDiagonal = OSU_REFERENCE_HEIGHT * Math.sqrt(aspect * aspect + 1);
  const holeRadius = look.radius * OSU_REFERENCE_HEIGHT;
  const half = Math.ceil(Math.max(halfDiagonal, holeRadius)) + 2;
  return { size: half * 2, holeRadius };
}

export function currentSkinFromConfig(cfg: string): string | null {
  for (const line of cfg.split(/\r?\n/)) {
    const m = /^\s*Skin\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[1]) return m[1];
  }
  return null;
}

export function setIniGeneralValues(ini: string | null, values: Record<string, string>): string {
  const lines = (ini ?? "[General]").split(/\r?\n/);
  const pending = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), [k, v] as [string, string]]));
  let section = "";
  let generalEnd = -1;
  let hasGeneral = false;
  const out: string[] = [];
  for (const line of lines) {
    const header = /^\s*\[(.+)\]\s*$/.exec(line);
    if (header) {
      if (section === "general") generalEnd = out.length;
      section = header[1].trim().toLowerCase();
      if (section === "general") hasGeneral = true;
      out.push(line);
      continue;
    }
    const key = line.split(":")[0].trim().toLowerCase();
    const replacement = section === "general" ? pending.get(key) : undefined;
    if (replacement) {
      out.push(`${replacement[0]}: ${replacement[1]}`);
      pending.delete(key);
    } else {
      out.push(line);
    }
  }
  if (section === "general") generalEnd = out.length;
  const missing = [...pending.values()].map(([k, v]) => `${k}: ${v}`);
  if (missing.length === 0) return out.join("\r\n");
  if (!hasGeneral) return ["[General]", ...missing, "", ...out].join("\r\n");
  while (generalEnd > 0 && out[generalEnd - 1].trim() === "") generalEnd--;
  out.splice(generalEnd, 0, ...missing);
  return out.join("\r\n");
}
