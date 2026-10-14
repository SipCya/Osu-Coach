import { inject, injectable, postConstruct } from "inversify";
import { AudioSettings, AudioSettingsStore } from "./settings";
import { STAGE_TYPES } from "../../types";
import { GameplayClock } from "../game/GameplayClock";

@injectable()
export class AudioEngine {
  musicGain: GainNode;
  samplesGain: GainNode;
  masterGain: GainNode;

  musicUrl?: string;
  musicBuffer?: AudioBuffer;

  song?: MediaElementAudioSourceNode;

  sampleWindow = 0.1;
  schedulePointer = 0;

  constructor(
    private readonly audioSettingService: AudioSettingsStore,
    @inject(STAGE_TYPES.AUDIO_CONTEXT) private readonly audioContext: AudioContext,
    private readonly gameClock: GameplayClock,
  ) {
    this.masterGain = this.audioContext.createGain();
    this.musicGain = this.audioContext.createGain();
    this.musicGain.connect(this.masterGain);
    this.samplesGain = this.audioContext.createGain();
    this.samplesGain.connect(this.masterGain);
    this.masterGain.connect(this.audioContext.destination);
  }

  @postConstruct()
  postConstruct() {
    console.log("Initializing AudioEngine");
    this.setupListeners();
  }

  setSong(audio: HTMLAudioElement) {
    this.song = this.audioContext.createMediaElementSource(audio);
    this.song.connect(this.musicGain);
  }

  /** Taps the master output into a MediaStream so a recording can include the audio. */
  createRecordingStream(): { stream: MediaStream; stop: () => void } {
    const destination = this.audioContext.createMediaStreamDestination();
    this.masterGain.connect(destination);
    return {
      stream: destination.stream,
      stop: () => {
        try {
          this.masterGain.disconnect(destination);
        } catch {
          /* already disconnected */
        }
      },
    };
  }

  setupListeners() {
    this.gameClock.seeked$.subscribe(this.seekTo.bind(this));
    this.gameClock.isPlaying$.subscribe((isPlaying: boolean) => {
      if (isPlaying) this.start();
      else this.pause();
    });
    this.gameClock.speed$.subscribe(this.changePlaybackRate.bind(this));

    this.audioSettingService.settings$.subscribe((value) => this.handleAudioSettingsChanged(value));
  }

  start() {
    this.audioContext.resume();
    this.song?.mediaElement.play();
  }

  pause() {
    if (this.song) {
      this.song.mediaElement.pause();
      this.schedulePointer = 0;
    }
  }

  changePlaybackRate(newPlaybackRate: number) {
    if (this.song) {
      this.song.mediaElement.playbackRate = newPlaybackRate;
    }
  }

  currentTime() {
    return (this.song?.mediaElement.currentTime ?? 0) * 1000;
  }

  seekTo(toInMs: number) {
    if (this.song) {
      this.song.mediaElement.currentTime = toInMs / 1000;
    }
  }

  get isPlaying() {
    return !this.song?.mediaElement.paused;
  }

  togglePlaying(): boolean {
    if (this.isPlaying) this.pause();
    else this.start();
    return this.isPlaying;
  }

  get durationInMs() {
    return (this.song?.mediaElement.duration ?? 1) * 1000;
  }

  destroy() {
    if (this.song) {
      this.song.disconnect();
      this.song = undefined;
    }
  }

  private handleAudioSettingsChanged(settings: AudioSettings) {
    const { muted, volume } = settings;
    this.masterGain.gain.value = muted ? 0 : volume.master;
    this.musicGain.gain.value = volume.music;
    this.samplesGain.gain.value = volume.effects;
  }
}
