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

/** A storyboard sample: an absolute file path played once at `time` (export mixdown only). */
export interface StoryboardSound {
  time: number;
  file: string; // absolute path (already resolved against the beatmap folder)
  volume: number; // 0..1
}

const EXTENSIONS = [".wav", ".ogg", ".mp3"];
const LOOKAHEAD_MS = 120;
const TICK_MS = 20;
const LATE_TOLERANCE_MS = 30;
// A looping source (slider slide / spinner spin) needs a real buffer. Many skins ship an empty
// "mute" sample (e.g. a 44-byte header-only WAV → a 0-length AudioBuffer); looping that makes the
// offline renderer spin forever, so anything shorter than this is dropped from the continuous mix.
const MIN_LOOP_SECONDS = 0.02;

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
  // Looping slider/spinner sounds and storyboard one-shots, only consumed by renderMixdown.
  private continuous: PlayableContinuous[] = [];
  private storyboard: PlayableEvent[] = [];
  private pointer = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scheduled = new Set<AudioBufferSourceNode>();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private loadToken = 0;
  private lastEvents: HitsoundEvent[] = [];
  private lastContinuous: ContinuousEvent[] = [];
  private lastStoryboard: StoryboardSound[] = [];
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

  async load(
    events: HitsoundEvent[],
    continuous: ContinuousEvent[],
    storyboard: StoryboardSound[],
    folders: HitsoundFolders,
  ) {
    const token = ++this.loadToken;
    this.lastEvents = events;
    this.lastContinuous = continuous;
    this.lastStoryboard = storyboard;
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
      // Drop empty/placeholder loop samples here so a muted skin can never reach the looping render.
      const sounds = (await toSounds(event.samples)).filter((s) => s.buffer.duration >= MIN_LOOP_SECONDS);
      if (sounds.length > 0) playableContinuous.push({ startMs: event.startMs, endMs: event.endMs, sounds });
    }
    // Storyboard samples resolve to a concrete file (no skin banks), so decode each path directly.
    const playableStoryboard: PlayableEvent[] = [];
    for (const s of storyboard) {
      const buffer = await this.decode(s.file);
      if (buffer) playableStoryboard.push({ time: s.time, sounds: [{ buffer, volume: s.volume }] });
    }
    if (token !== this.loadToken) return;
    this.events = playable;
    this.continuous = playableContinuous;
    this.storyboard = playableStoryboard;
    this.resync();
  }

  async changeSkinFolder(skin: string | null) {
    if (!this.lastFolders || this.lastFolders.skin === skin) return;
    await this.load(this.lastEvents, this.lastContinuous, this.lastStoryboard, { ...this.lastFolders, skin });
  }

  /**
   * Renders song + hitsounds into a single offline-mixed AudioBuffer for video export.
   * Reuses the already-decoded sample buffers and the live music/effects levels.
   */
  async renderMixdown(songPath: string, durationMs: number, startMs = 0): Promise<AudioBuffer | null> {
    try {
      let songBuffer: AudioBuffer | null = null;
      try {
        const data = await readFile(songPath);
        const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        songBuffer = await this.audioContext.decodeAudioData(copy);
      } catch {
        songBuffer = null;
      }

      // Mix by summing PCM directly into two channel arrays. This is deterministic and fast and
      // cannot hang — unlike OfflineAudioContext, which gets pathologically slow with thousands of
      // source nodes. decodeAudioData already resamples every buffer to the context rate, so no
      // resampling is needed here.
      const sampleRate = this.audioContext.sampleRate;
      const startSample = Math.max(0, Math.round((startMs / 1000) * sampleRate));
      const length = Math.max(1, Math.ceil(((durationMs - startMs) / 1000) * sampleRate));
      const left = new Float32Array(length);
      const right = new Float32Array(length);

      const musicLevel = this.audioEngine.musicGain.gain.value;
      const sampleLevel = this.audioEngine.samplesGain.gain.value;

      // Add a one-shot buffer at destStart (output samples), reading from srcStart, scaled by gain.
      const addOneShot = (buf: AudioBuffer, destStart: number, gain: number, srcStart = 0) => {
        if (gain === 0 || buf.length <= srcStart) return;
        const ch0 = buf.getChannelData(0);
        const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
        const begin = Math.max(0, -destStart); // skip samples that land before the window start
        const count = buf.length - srcStart;
        for (let i = begin; i < count; i++) {
          const d = destStart + i;
          if (d >= length) break;
          left[d] += ch0[srcStart + i] * gain;
          right[d] += ch1[srcStart + i] * gain;
        }
      };

      if (songBuffer) addOneShot(songBuffer, 0, musicLevel, startSample);

      const oneShots = [...this.events, ...this.storyboard];
      for (const event of oneShots) {
        const destStart = Math.round((event.time / 1000) * sampleRate) - startSample;
        for (const sound of event.sounds) addOneShot(sound.buffer, destStart, sampleLevel * sound.volume);
      }

      // Looping slider slides / spinner spins: fill [from, to) by cycling the buffer. Empty/placeholder
      // samples are already dropped in load(); the guard here is a cheap extra safety.
      for (const event of this.continuous) {
        const from = Math.max(0, Math.round((event.startMs / 1000) * sampleRate) - startSample);
        const to = Math.min(length, Math.round((event.endMs / 1000) * sampleRate) - startSample);
        if (to <= from) continue;
        for (const sound of event.sounds) {
          const buf = sound.buffer;
          if (!buf || buf.length === 0 || buf.duration < MIN_LOOP_SECONDS) continue;
          const ch0 = buf.getChannelData(0);
          const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
          const gain = sampleLevel * sound.volume;
          const blen = buf.length;
          for (let d = from; d < to; d++) {
            const s = (d - from) % blen;
            left[d] += ch0[s] * gain;
            right[d] += ch1[s] * gain;
          }
        }
      }

      const out = this.audioContext.createBuffer(2, length, sampleRate);
      out.copyToChannel(left, 0);
      out.copyToChannel(right, 1);
      return out;
    } catch (e) {
      // Never let a hitsound problem abort the export: fall back to the plain song track.
      console.error("[hitsounds] renderMixdown failed; exporting with the raw song", e);
      return null;
    }
  }

  async setUseBeatmapHitsounds(useBeatmapHitsounds: boolean) {
    if (!this.lastFolders || this.lastFolders.useBeatmapHitsounds === useBeatmapHitsounds) return;
    await this.load(this.lastEvents, this.lastContinuous, this.lastStoryboard, {
      ...this.lastFolders,
      useBeatmapHitsounds,
    });
  }

  clear() {
    this.loadToken++;
    this.stopSources();
    this.events = [];
    this.continuous = [];
    this.storyboard = [];
    this.lastEvents = [];
    this.lastContinuous = [];
    this.lastStoryboard = [];
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
