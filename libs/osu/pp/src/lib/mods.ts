import { OsuClassicMod } from "@osujs/core";

const modsThatAffectSR = (flashlightIncluded: boolean): OsuClassicMod[] => {
  const defaultMods: OsuClassicMod[] = ["DOUBLE_TIME", "HALF_TIME", "EASY", "HARD_ROCK", "FLASH_LIGHT", "RELAX"];
  if (flashlightIncluded) {
    defaultMods.push("HIDDEN");
  }
  return defaultMods;
};

export function normalizeModsForSR(mods: OsuClassicMod[]): OsuClassicMod[] {
  const includesFL = mods.includes("FLASH_LIGHT");
  const modsFilter = modsThatAffectSR(includesFL);
  return mods.filter((m) => modsFilter.includes(m)).sort();
}
