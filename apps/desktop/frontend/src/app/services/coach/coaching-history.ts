import { BehaviorSubject } from "rxjs";

/**
 * A compact summary of one analysed replay, persisted across sessions so the coaching
 * panel can show the player's progress and recurring weaknesses over time. Kept small
 * (a few hundred bytes) so a long history still fits comfortably in localStorage.
 */
export interface CoachingEntry {
  replayHash: string; // dedup key — re-analysing the same replay updates, never duplicates
  beatmapMd5: string;
  date: number; // Date.now() when it was analysed
  title: string;
  artist: string;
  player: string;
  mods: string[];
  accuracy: number; // 0..1 (from circle judgements; a close approximation)
  ur: number;
  meanErrorMs: number;
  suggestedOffsetMs: number;
  counts: { great: number; ok: number; meh: number; miss: number };
  misses: { aim: number; tapping: number; other: number };
}

const KEY = "osucoach-coaching-history";
const PLAYER_KEY = "osucoach-coaching-player"; // which player's progress to show by default
const MAX_ENTRIES = 500; // keep the most recent N so the store can't grow without bound

function load(): CoachingEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CoachingEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(entries: CoachingEntry[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable / full — history is best-effort */
  }
}

/** Cross-session history of analysed replays, oldest first. */
export const coachingHistory$ = new BehaviorSubject<CoachingEntry[]>(load());

/** Append an analysed replay (replacing any earlier analysis of the same replay). */
export function recordCoachingEntry(entry: CoachingEntry): void {
  const without = coachingHistory$.getValue().filter((e) => e.replayHash !== entry.replayHash);
  const next = [...without, entry].slice(-MAX_ENTRIES);
  coachingHistory$.next(next);
  persist(next);
}

/** Remove every recorded play for one player (e.g. someone else's replays you reviewed). */
export function clearPlayerHistory(player: string): void {
  const next = coachingHistory$.getValue().filter((e) => e.player !== player);
  coachingHistory$.next(next);
  persist(next);
}

export function clearCoachingHistory(): void {
  coachingHistory$.next([]);
  persist([]);
}

/**
 * The player whose progress the panel shows. Since the app can't know "who you are", this
 * defaults to the most-analysed player and is remembered once you pick one, so reviewing
 * someone else's replay (for a cheat check) never pollutes your own progress.
 */
export const preferredPlayer$ = new BehaviorSubject<string | null>(
  (() => {
    try {
      return window.localStorage.getItem(PLAYER_KEY);
    } catch {
      return null;
    }
  })(),
);

export function setPreferredPlayer(player: string): void {
  preferredPlayer$.next(player);
  try {
    window.localStorage.setItem(PLAYER_KEY, player);
  } catch {
    /* ignore unavailable storage */
  }
}
