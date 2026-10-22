import { join } from "path";
import { BlueprintInfo } from "../../model/BlueprintInfo";

/** One selectable song in the compilation picker (deduped per folder+audio file). */
export interface SongEntry {
  key: string;
  artist: string;
  title: string;
  creator: string;
  folderName: string;
  audioFileName: string;
  osuFileName: string;
  /** Absolute path to the audio file on disk. */
  audioPath: string;
  lastPlayed: Date;
}

/**
 * Collapse all beatmap difficulties from osu!.db into one entry per song (a folder's
 * audio file), keeping the most recently played difficulty's metadata, sorted by
 * artist + title. Entries without an audio file or folder are dropped.
 */
export function buildSongLibrary(blueprints: BlueprintInfo[], songsFolder: string): SongEntry[] {
  const byKey = new Map<string, SongEntry>();
  for (const b of blueprints) {
    if (!b.audioFileName || !b.folderName) continue;
    const key = `${b.folderName}\u0000${b.audioFileName}`.toLowerCase();
    const entry: SongEntry = {
      key,
      artist: b.artist,
      title: b.title,
      creator: b.creator,
      folderName: b.folderName,
      audioFileName: b.audioFileName,
      osuFileName: b.osuFileName,
      audioPath: join(songsFolder, b.folderName, b.audioFileName),
      lastPlayed: b.lastPlayed,
    };
    const existing = byKey.get(key);
    if (!existing || entry.lastPlayed > existing.lastPlayed) byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) =>
    `${a.artist} ${a.title}`.localeCompare(`${b.artist} ${b.title}`, undefined, { sensitivity: "base" }),
  );
}

/** Filter songs by a free-text query; every whitespace-separated term must match. */
export function searchSongs(songs: SongEntry[], query: string, limit = 300): SongEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return songs.slice(0, limit);
  const terms = q.split(/\s+/);
  const out: SongEntry[] = [];
  for (const s of songs) {
    const hay = `${s.artist} ${s.title} ${s.creator}`.toLowerCase();
    if (terms.every((t) => hay.includes(t))) {
      out.push(s);
      if (out.length >= limit) break;
    }
  }
  return out;
}
