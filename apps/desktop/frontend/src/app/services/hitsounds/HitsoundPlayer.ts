import { inject, injectable } from "inversify";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { STAGE_TYPES } from "../types";
import { AudioEngine } from "../common/audio/AudioEngine";
import { GameplayClock } from "../common/game/GameplayClock";
import { HitsoundEvent } from "./hitsound-events";

export interface HitsoundFolders {
  beatmap: string;
  skin: string | null;
  fallback: string;
}

interface PlayableSound {
  buffer: AudioBuffer;
  volume: number;
}

interface PlayableEvent {
  time: number;
  sounds: PlayableSound[];
}

const EXTENSIONS = [".wav", ".ogg", ".mp3"];
const LOOKAHEAD_MS = 120;
const TICK_MS = 20;
const LATE_TOLERANCE_MS = 30;

async function listFolder(folder: string | null): Promise<Map<string, string>> {
  if (!folder) return new Map();
  try {
    const names = await readdir(folder);
    return new Map(names.map((n) => [n.toLowerCase(), join(folder, n)]));
  } catch {
    return new Map();
  }
}

function findFile(index: Map<string, string>, base: string | null): string | null {
  if (!base) return null;
  const lower = base.toLowerCase();
  if (index.has(lower)) return index.get(lower) ?? null;
  for (const ext of EXTENSIONS) {
    const found = index.get(lower + ext);
    if (found) return found;
  }
  return null;
}

@injectable()
export class HitsoundPlayer {
  private events: PlayableEvent[] = [];
  private pointer = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scheduled = new Set<AudioBufferSourceNode>();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private loadToken = 0;
  private lastEvents: HitsoundEvent[] = [];
  private lastFolders: HitsoundFolders | null = null;

  constructor(
    @inject(STAGE_TYPES.AUDIO_CONTEXT) private readonly audioContext: AudioContext,
    private readonly audioEngine: AudioEngine,
    private readonly gameClock: GameplayClock,
  ) {
    this.gameClock.isPlaying$.subscribe((playing) => (playing ? this.startScheduling() : this.stopScheduling()));
    this.gameClock.seeked$.subscribe(() => this.resync());
    this.gameClock.speed$.subscribe(() => this.resync());
  }

  private decode(path: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(path);
    if (cached) return cached;
    const promise = readFile(path)
      .then((data) => {
        if (data.length === 0) return null;
        const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        return this.audioContext.decodeAudioData(copy);
      })
      .catch(() => null);
    this.buffers.set(path, promise);
    return promise;
  }

  async load(events: HitsoundEvent[], folders: HitsoundFolders) {
    const token = ++this.loadToken;
    this.lastEvents = events;
    this.lastFolders = folders;
    const [beatmap, skin, fallback] = await Promise.all([
      listFolder(folders.beatmap),
      listFolder(folders.skin),
      listFolder(folders.fallback),
    ]);
    const playable: PlayableEvent[] = [];
    for (const event of events) {
      const sounds: PlayableSound[] = [];
      for (const sample of event.samples) {
        const path =
          findFile(beatmap, sample.beatmapFile) ??
          findFile(skin, sample.skinFile) ??
          findFile(fallback, sample.skinFile);
        if (!path) continue;
        const buffer = await this.decode(path);
        if (buffer) sounds.push({ buffer, volume: sample.volume });
      }
      if (sounds.length > 0) playable.push({ time: event.time, sounds });
    }
    if (token !== this.loadToken) return;
    this.events = playable;
    this.resync();
  }

  async changeSkinFolder(skin: string | null) {
    if (!this.lastFolders || this.lastFolders.skin === skin) return;
    await this.load(this.lastEvents, { ...this.lastFolders, skin });
  }

  clear() {
    this.loadToken++;
    this.stopSources();
    this.events = [];
    this.lastEvents = [];
    this.lastFolders = null;
    this.pointer = 0;
  }

  private now(): number {
    this.gameClock.updateTimeElapsed();
    return this.gameClock.timeElapsedInMs;
  }

  private stopSources() {
    for (const source of this.scheduled) {
      try {
        source.stop();
      } catch {
        source.disconnect();
      }
    }
    this.scheduled.clear();
  }

  private resync() {
    this.stopSources();
    const now = this.now();
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.events[mid].time < now) lo = mid + 1;
      else hi = mid;
    }
    this.pointer = lo;
  }

  private tick() {
    if (!this.gameClock.isPlaying) return;
    const now = this.now();
    const speed = this.gameClock.speed || 1;
    const horizon = now + LOOKAHEAD_MS * speed;
    while (this.pointer < this.events.length && this.events[this.pointer].time <= horizon) {
      const event = this.events[this.pointer++];
      if (event.time < now - LATE_TOLERANCE_MS) continue;
      const startAt = this.audioContext.currentTime + Math.max(0, (event.time - now) / speed / 1000);
      for (const sound of event.sounds) {
        const source = this.audioContext.createBufferSource();
        source.buffer = sound.buffer;
        const gain = this.audioContext.createGain();
        gain.gain.value = sound.volume;
        source.connect(gain);
        gain.connect(this.audioEngine.samplesGain);
        source.onended = () => {
          this.scheduled.delete(source);
          gain.disconnect();
        };
        this.scheduled.add(source);
        source.start(startAt);
      }
    }
  }

  private startScheduling() {
    if (this.timer) return;
    this.resync();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopScheduling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopSources();
  }
}
