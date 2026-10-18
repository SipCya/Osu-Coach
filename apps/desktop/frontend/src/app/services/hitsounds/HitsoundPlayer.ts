import { inject, injectable } from "inversify";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { STAGE_TYPES } from "../types";
import { AudioEngine } from "../common/audio/AudioEngine";
import { GameplayClock } from "../common/game/GameplayClock";
import { ContinuousEvent, HitsoundEvent } from "./hitsound-events";
import { SampleRequest } from "./hitsound-data";

export interface HitsoundFolders {
  beatmap: string;
  skin: string | null;
  fallback: string;
  /** When true, a beatmap's custom hitsounds win over the skin (osu! default). When false, the skin is used. */
  useBeatmapHitsounds: boolean;
}

interface PlayableSound {
  buffer: AudioBuffer;
  volume: number;
}

interface PlayableEvent {
  time: number;
  sounds: PlayableSound[];
}

/** A slider-slide / spinner-spin loop, resolved to buffers (export mixdown only). */
interface PlayableContinuous {
  startMs: number;
  endMs: number;
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
  // Looping slider/spinner sounds, only consumed by renderMixdown (not scheduled live).
  private continuous: PlayableContinuous[] = [];
  private pointer = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scheduled = new Set<AudioBufferSourceNode>();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private loadToken = 0;
  private lastEvents: HitsoundEvent[] = [];
  private lastContinuous: ContinuousEvent[] = [];
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

  async load(events: HitsoundEvent[], continuous: ContinuousEvent[], folders: HitsoundFolders) {
    const token = ++this.loadToken;
    this.lastEvents = events;
    this.lastContinuous = continuous;
    this.lastFolders = folders;
    const [beatmap, skin, fallback] = await Promise.all([
      listFolder(folders.beatmap),
      listFolder(folders.skin),
      listFolder(folders.fallback),
    ]);
    const resolve = (sample: SampleRequest): string | null =>
      folders.useBeatmapHitsounds
        ? findFile(beatmap, sample.beatmapFile) ??
          findFile(skin, sample.skinFile) ??
          findFile(fallback, sample.skinFile)
        : findFile(skin, sample.skinFile) ?? findFile(fallback, sample.skinFile);
    const toSounds = async (samples: SampleRequest[]): Promise<PlayableSound[]> => {
      const sounds: PlayableSound[] = [];
      for (const sample of samples) {
        const path = resolve(sample);
        if (!path) continue;
        const buffer = await this.decode(path);
        if (buffer) sounds.push({ buffer, volume: sample.volume });
      }
      return sounds;
    };

    const playable: PlayableEvent[] = [];
    for (const event of events) {
      const sounds = await toSounds(event.samples);
      if (sounds.length > 0) playable.push({ time: event.time, sounds });
    }
    const playableContinuous: PlayableContinuous[] = [];
    for (const event of continuous) {
      const sounds = await toSounds(event.samples);
      if (sounds.length > 0) playableContinuous.push({ startMs: event.startMs, endMs: event.endMs, sounds });
    }
    if (token !== this.loadToken) return;
    this.events = playable;
    this.continuous = playableContinuous;
    this.resync();
  }

  async changeSkinFolder(skin: string | null) {
    if (!this.lastFolders || this.lastFolders.skin === skin) return;
    await this.load(this.lastEvents, this.lastContinuous, { ...this.lastFolders, skin });
  }

  /**
   * Renders song + hitsounds into a single offline-mixed AudioBuffer for video export.
   * Reuses the already-decoded sample buffers and the live music/effects levels.
   */
  async renderMixdown(songPath: string, durationMs: number, startMs = 0): Promise<AudioBuffer | null> {
    let songBuffer: AudioBuffer | null = null;
    try {
      const data = await readFile(songPath);
      const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      songBuffer = await this.audioContext.decodeAudioData(copy);
    } catch {
      songBuffer = null;
    }

    const startSec = Math.max(0, startMs / 1000);
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.max(1, Math.ceil(((durationMs - startMs) / 1000) * sampleRate));
    const offline = new OfflineAudioContext(2, length, sampleRate);

    const musicLevel = this.audioEngine.musicGain.gain.value;
    const sampleLevel = this.audioEngine.samplesGain.gain.value;

    if (songBuffer) {
      const source = offline.createBufferSource();
      source.buffer = songBuffer;
      const gain = offline.createGain();
      gain.gain.value = musicLevel;
      source.connect(gain).connect(offline.destination);
      source.start(0, startSec);
    }

    for (const event of this.events) {
      const at = event.time / 1000 - startSec;
      if (at < 0) continue;
      for (const sound of event.sounds) {
        const source = offline.createBufferSource();
        source.buffer = sound.buffer;
        const gain = offline.createGain();
        gain.gain.value = sampleLevel * sound.volume;
        source.connect(gain).connect(offline.destination);
        source.start(at);
      }
    }

    // Looping slider slides / spinner spins, trimmed to the object's span (and the render window).
    const endSec = durationMs / 1000;
    for (const event of this.continuous) {
      const from = Math.max(event.startMs / 1000, startSec);
      const to = Math.min(event.endMs / 1000, endSec);
      const span = to - from;
      if (span <= 0) continue;
      for (const sound of event.sounds) {
        const source = offline.createBufferSource();
        source.buffer = sound.buffer;
        source.loop = true;
        const gain = offline.createGain();
        gain.gain.value = sampleLevel * sound.volume;
        source.connect(gain).connect(offline.destination);
        source.start(from - startSec);
        source.stop(from - startSec + span);
      }
    }

    return offline.startRendering();
  }

  async setUseBeatmapHitsounds(useBeatmapHitsounds: boolean) {
    if (!this.lastFolders || this.lastFolders.useBeatmapHitsounds === useBeatmapHitsounds) return;
    await this.load(this.lastEvents, this.lastContinuous, { ...this.lastFolders, useBeatmapHitsounds });
  }

  clear() {
    this.loadToken++;
    this.stopSources();
    this.events = [];
    this.continuous = [];
    this.lastEvents = [];
    this.lastContinuous = [];
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
