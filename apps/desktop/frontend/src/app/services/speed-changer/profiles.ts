import { DifficultyValues } from "./osu-rate";

export type SpeedSetting = { mode: "rate"; rate: number } | { mode: "bpm"; bpm: number };

export interface SpeedProfile {
  name: string;
  speed: SpeedSetting;
  changePitch: boolean;
  difficulty: Partial<DifficultyValues>;
}

export const MIN_RATE = 0.5;
export const MAX_RATE = 2.0;

const DIFFICULTY_KEYS: (keyof DifficultyValues)[] = ["ar", "cs", "od", "hp"];

export function rateForBpm(targetBpm: number, mainBpm: number): number | null {
  if (!Number.isFinite(targetBpm) || targetBpm <= 0 || mainBpm <= 0) return null;
  const rate = targetBpm / mainBpm;
  return rate >= MIN_RATE - 1e-9 && rate <= MAX_RATE + 1e-9 ? rate : null;
}

export function bpmRange(mainBpm: number): { min: number; max: number } {
  return { min: Math.ceil(mainBpm * MIN_RATE), max: Math.floor(mainBpm * MAX_RATE) };
}

export function changedDifficulty(current: DifficultyValues, original: DifficultyValues): Partial<DifficultyValues> {
  const changed: Partial<DifficultyValues> = {};
  for (const key of DIFFICULTY_KEYS) {
    if (Math.abs(current[key] - original[key]) > 1e-6) changed[key] = current[key];
  }
  return changed;
}

export function createProfile(
  name: string,
  speed: SpeedSetting,
  changePitch: boolean,
  difficulty: DifficultyValues,
  original: DifficultyValues,
): SpeedProfile {
  return { name: name.trim(), speed, changePitch, difficulty: changedDifficulty(difficulty, original) };
}

export function applyProfileDifficulty(profile: SpeedProfile, original: DifficultyValues): DifficultyValues {
  return { ...original, ...profile.difficulty };
}

export function sameProfile(a: SpeedProfile, b: SpeedProfile): boolean {
  const speedEqual =
    a.speed.mode === b.speed.mode &&
    (a.speed.mode === "rate"
      ? Math.abs(a.speed.rate - (b.speed as { rate: number }).rate) < 1e-6
      : Math.abs(a.speed.bpm - (b.speed as { bpm: number }).bpm) < 1e-6);
  const keys = new Set([...Object.keys(a.difficulty), ...Object.keys(b.difficulty)]) as Set<keyof DifficultyValues>;
  const difficultyEqual = [...keys].every(
    (k) =>
      a.difficulty[k] !== undefined &&
      b.difficulty[k] !== undefined &&
      Math.abs(a.difficulty[k]! - b.difficulty[k]!) < 1e-6,
  );
  return speedEqual && a.changePitch === b.changePitch && difficultyEqual;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseProfile(value: unknown): SpeedProfile | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name.trim()) return null;
  const speed = p.speed as Record<string, unknown> | undefined;
  let parsedSpeed: SpeedSetting | null = null;
  if (speed?.mode === "rate" && isNumber(speed.rate)) parsedSpeed = { mode: "rate", rate: speed.rate };
  if (speed?.mode === "bpm" && isNumber(speed.bpm)) parsedSpeed = { mode: "bpm", bpm: speed.bpm };
  if (!parsedSpeed) return null;
  const difficulty: Partial<DifficultyValues> = {};
  const rawDifficulty = (p.difficulty ?? {}) as Record<string, unknown>;
  for (const key of DIFFICULTY_KEYS) {
    const v = rawDifficulty[key];
    if (isNumber(v)) difficulty[key] = Math.min(10, Math.max(0, v));
  }
  return { name: p.name.trim(), speed: parsedSpeed, changePitch: p.changePitch === true, difficulty };
}

export function parseProfiles(raw: string | null): SpeedProfile[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.map(parseProfile).filter((p): p is SpeedProfile => p !== null) : [];
  } catch {
    return [];
  }
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function findProfile(profiles: SpeedProfile[], name: string): SpeedProfile | undefined {
  return profiles.find((p) => sameName(p.name, name));
}

export function upsertProfile(profiles: SpeedProfile[], profile: SpeedProfile): SpeedProfile[] {
  const index = profiles.findIndex((p) => sameName(p.name, profile.name));
  if (index < 0) return [...profiles, profile];
  return profiles.map((p, i) => (i === index ? profile : p));
}

export function deleteProfile(profiles: SpeedProfile[], name: string): SpeedProfile[] {
  return profiles.filter((p) => !sameName(p.name, name));
}
