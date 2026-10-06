export type SkinSource = "builtin" | "osu";

export interface SkinId {
  source: SkinSource;
  name: string;
}

export function skinIdToString({ source, name }: SkinId) {
  return `${source}:${name}`;
}

const isSkinSource = (s: string): s is SkinSource => s === "builtin" || s === "osu";

export function stringToSkinId(str: string): SkinId {
  const [source, name] = str.split(":");
  if (isSkinSource(source)) {
    return { source, name };
  } else {
    throw Error("Skin source wrong");
  }
}

export const DEFAULT_OSU_SKIN_ID: SkinId = { source: "builtin", name: "OsuDefaultSkin" };
export const DEFAULT_YUGEN_SKIN_ID: SkinId = { source: "builtin", name: "YUGEN" };
