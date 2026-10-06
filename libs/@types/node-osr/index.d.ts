export class Replay {
  gameMode: number;
  gameVersion: number;
  beatmapMD5: string;
  playerName: string;
  replayMD5: string;
  number_300s: number;
  number_100s: number;
  number_50s: number;
  gekis: number;
  katus: number;
  misses: number;
  score: number;
  max_combo: number;
  perfect_combo: number;
  mods: number;
  life_bar: string;
  timestamp: number;
  replay_length: number;
  replay_data: string;

  serializeSync(): Buffer;

  serialize(): Promise<Buffer>;

  writeSync(path: string);

  write(path: string, cb?: any);
}

export function read(input: string | Buffer): Promise<Replay>;
export function read(input: string | Buffer, cb?: (err: Error, replay: Replay) => unknown): void;

export function readSync(input: string | Buffer): Replay;
