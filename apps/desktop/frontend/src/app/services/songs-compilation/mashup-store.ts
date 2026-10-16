import { BehaviorSubject } from "rxjs";
import { CompSegment } from "./mashup";

/**
 * Module-level state for the Song Mashup screen so the work-in-progress survives
 * navigating to another tab and back (the screen component unmounts on route change).
 * Lives for the app session; it is not persisted to disk.
 */
export const mashupSegments$ = new BehaviorSubject<CompSegment[]>([]);
export const mashupQuery$ = new BehaviorSubject<string>("");

export function setMashupSegments(update: CompSegment[] | ((prev: CompSegment[]) => CompSegment[])): void {
  const next = typeof update === "function" ? update(mashupSegments$.getValue()) : update;
  mashupSegments$.next(next);
}

/** Clear the whole screen back to an empty state. */
export function resetMashup(): void {
  mashupSegments$.next([]);
  mashupQuery$.next("");
}
