import { cloneGameState, defaultGameState, GameState } from "./GameState";
import { ReplayFrame } from "../replays/Replay";
import { Vec2 } from "@osujs/math";
import { Beatmap } from "../beatmap/Beatmap";
import { GameStateEvaluator, GameStateEvaluatorOptions } from "./GameStateEvaluator";

export interface GameStateTimeMachine {
  gameStateAt(time: number): GameState;
}

export class BucketedGameStateTimeMachine implements GameStateTimeMachine {
  currentIndex = 0;
  currentGameState: GameState;
  storedGameState: GameState[] = [];
  bucketSize: number;
  frames: ReplayFrame[];
  evaluator: GameStateEvaluator;

  constructor(
    initialKnownFrames: ReplayFrame[],
    private readonly beatmap: Beatmap,
    private readonly settings: GameStateEvaluatorOptions,
    bucketSize?: number,
  ) {
    this.frames = [{ time: -727_727, position: new Vec2(0, 0), actions: [] }, ...initialKnownFrames];
    this.bucketSize = bucketSize ?? Math.ceil(Math.sqrt(this.frames.length));
    this.storedGameState[0] = defaultGameState();
    this.currentGameState = cloneGameState(this.storedGameState[0]);
    this.evaluator = new GameStateEvaluator(beatmap, settings);
  }

  private getHighestCachedIndex(time: number): number {
    for (let i = 0; i < this.frames.length; i += this.bucketSize) {
      if (time < this.frames[i].time || !this.storedGameState[i]) {
        return i - this.bucketSize;
      }
    }
    return 0;
  }

  gameStateAt(time: number): GameState {
    const highestCachedIndex = this.getHighestCachedIndex(time);

    if (this.currentIndex < highestCachedIndex || time < this.frames[this.currentIndex].time) {
      this.currentIndex = highestCachedIndex;
      this.currentGameState = cloneGameState(this.storedGameState[this.currentIndex]);
    }

    while (this.currentIndex + 1 < this.frames.length) {
      const nextFrame = this.frames[this.currentIndex + 1];
      if (time < nextFrame.time) {
        break;
      }

      this.evaluator.evaluate(this.currentGameState, nextFrame);
      this.currentIndex += 1;

      if (this.currentIndex % this.bucketSize === 0) {
        this.storedGameState[this.currentIndex] = cloneGameState(this.currentGameState);
      }
    }
    return this.currentGameState;
  }
}
