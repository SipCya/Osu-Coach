export interface ScoreEntry {
  player: string;
  beatmapMD5: string;
  replayMD5: string;
  raw: Buffer;
}

export interface ScoresDbBeatmap {
  md5: string;
  scores: ScoreEntry[];
}

export interface ScoresDb {
  version: number;
  beatmaps: ScoresDbBeatmap[];
}

const TARGET_PRACTICE = 1 << 23;

class Cursor {
  position = 0;

  constructor(readonly buffer: Buffer) {}

  private need(bytes: number) {
    if (this.position + bytes > this.buffer.length) throw new Error("scores.db is truncated or corrupted");
  }

  skip(bytes: number) {
    this.need(bytes);
    this.position += bytes;
  }

  int32() {
    this.need(4);
    const value = this.buffer.readInt32LE(this.position);
    this.position += 4;
    return value;
  }

  string() {
    this.need(1);
    const marker = this.buffer[this.position++];
    if (marker === 0x00) return "";
    if (marker !== 0x0b) throw new Error("scores.db is corrupted (bad string marker)");
    let length = 0;
    let shift = 0;
    for (;;) {
      this.need(1);
      const byte = this.buffer[this.position++];
      length += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    this.need(length);
    const value = this.buffer.toString("utf8", this.position, this.position + length);
    this.position += length;
    return value;
  }
}

function readScore(cursor: Cursor): ScoreEntry {
  const start = cursor.position;
  cursor.skip(1);
  cursor.skip(4);
  const beatmapMD5 = cursor.string();
  const player = cursor.string();
  const replayMD5 = cursor.string();
  cursor.skip(2 * 6);
  cursor.skip(4);
  cursor.skip(2);
  cursor.skip(1);
  const mods = cursor.int32();
  cursor.string();
  cursor.skip(8);
  cursor.skip(4);
  cursor.skip(8);
  if (mods & TARGET_PRACTICE) cursor.skip(8);
  return { player, beatmapMD5, replayMD5, raw: cursor.buffer.subarray(start, cursor.position) };
}

export function readScoresDb(buffer: Buffer): ScoresDb {
  const cursor = new Cursor(buffer);
  const version = cursor.int32();
  const beatmapCount = cursor.int32();
  const beatmaps: ScoresDbBeatmap[] = [];
  for (let i = 0; i < beatmapCount; i++) {
    const md5 = cursor.string();
    const count = cursor.int32();
    const scores: ScoreEntry[] = [];
    for (let j = 0; j < count; j++) scores.push(readScore(cursor));
    beatmaps.push({ md5, scores });
  }
  if (cursor.position !== buffer.length) throw new Error("scores.db has an unknown format");
  return { version, beatmaps };
}

function int32(value: number) {
  const b = Buffer.alloc(4);
  b.writeInt32LE(value, 0);
  return b;
}

function osuString(value: string) {
  if (value.length === 0) return Buffer.from([0x00]);
  const bytes = Buffer.from(value, "utf8");
  const header = [0x0b];
  let length = bytes.length;
  do {
    let byte = length & 0x7f;
    length = Math.floor(length / 128);
    if (length > 0) byte |= 0x80;
    header.push(byte);
  } while (length > 0);
  return Buffer.concat([Buffer.from(header), bytes]);
}

export function writeScoresDb(db: ScoresDb, keep: (score: ScoreEntry) => boolean = () => true): Buffer {
  const chunks: Buffer[] = [int32(db.version), int32(db.beatmaps.length)];
  for (const b of db.beatmaps) {
    const scores = b.scores.filter(keep);
    chunks.push(osuString(b.md5), int32(scores.length), ...scores.map((s) => s.raw));
  }
  return Buffer.concat(chunks);
}

export interface PlayerScores {
  player: string;
  count: number;
}

export function scoresByPlayer(db: ScoresDb): PlayerScores[] {
  const counts = new Map<string, number>();
  for (const b of db.beatmaps) for (const s of b.scores) counts.set(s.player, (counts.get(s.player) ?? 0) + 1);
  return [...counts.entries()]
    .map(([player, count]) => ({ player, count }))
    .sort((a, b) => b.count - a.count || a.player.localeCompare(b.player));
}
