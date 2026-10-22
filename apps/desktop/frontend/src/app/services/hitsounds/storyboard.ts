/**
 * Storyboard audio samples: one-shot sounds a mapper triggers from the storyboard (voices,
 * SFX, drops) — separate from hitsounds. They live in the `[Events]` section of the `.osu`
 * (and any `.osb`) as `Sample,<time>,<layer>,"<file>",<volume>` (legacy keyword: `5`).
 */
export interface StoryboardSample {
  time: number; // ms (song time, like hit objects)
  file: string; // path as written in the map, relative to the beatmap folder
  volume: number; // 0..1
}

const SECTION = /^\[(.+)\]$/;
// Sample,time,layer,"file"[,volume] — keyword "Sample" or the legacy numeric "5".
const SAMPLE = /^(?:Sample|5),(-?\d+),\d+,"([^"]*)"(?:,(\d+))?/;

/** Parse the storyboard `Sample` events from a raw `.osu` / `.osb` file. */
export function parseStoryboardSamples(text: string): StoryboardSample[] {
  const out: StoryboardSample[] = [];
  let inEvents = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const sec = SECTION.exec(line);
    if (sec) {
      inEvents = sec[1] === "Events";
      continue;
    }
    if (!inEvents || !line || line.startsWith("//")) continue;
    const m = SAMPLE.exec(line);
    if (!m) continue;
    const time = Number(m[1]);
    const file = m[2].trim();
    const vol = m[3] !== undefined ? Number(m[3]) : 100;
    if (!Number.isFinite(time) || !file) continue;
    out.push({ time, file, volume: Math.max(0, Math.min(1, (Number.isFinite(vol) ? vol : 100) / 100)) });
  }
  return out;
}
