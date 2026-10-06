import {
  Beatmap,
  BucketedGameStateTimeMachine,
  defaultGameplayInfo,
  GameplayInfo,
  GameplayInfoEvaluator,
  GameState,
  HitObjectJudgement,
  isHitObjectJudgement,
  ReplayAnalysisEvent,
  retrieveEvents,
} from "@osujs/core";
import { injectable } from "inversify";
import type { OsuReplay } from "../../../model/OsuReplay";
import { BehaviorSubject } from "rxjs";
import { parser, std_diff } from "ojsama";
import { Queue } from "typescript-collections";
import { max } from "simple-statistics";
import { analyseMistakes, CoachAnalysis } from "../../coach/mistakes";

@injectable()
export class GameSimulator {
  private gameplayTimeMachine?: BucketedGameStateTimeMachine;
  private gameplayEvaluator?: GameplayInfoEvaluator;
  private currentState?: GameState;
  private lastState?: GameState;
  private currentInfo: GameplayInfo = defaultGameplayInfo;
  public replayEvents$: BehaviorSubject<ReplayAnalysisEvent[]>;
  public difficulties$: BehaviorSubject<number[]>;
  public judgements: HitObjectJudgement[] = [];
  public hits: [number, number, boolean][] = [];
  public coach$ = new BehaviorSubject<CoachAnalysis | null>(null);

  constructor() {
    this.replayEvents$ = new BehaviorSubject<ReplayAnalysisEvent[]>([]);
    this.difficulties$ = new BehaviorSubject<number[]>([]);
  }

  calculateDifficulties(rawBeatmap: string, durationInMs: number, mods: number) {
    console.log(`Calculating difficulty for beatmap with duration=${durationInMs}ms and mods=${mods}`);
    const p = new parser();
    p.feed(rawBeatmap);
    const map = p.map;
    const d = new std_diff().calc({ map, mods });

    const TIME_STEP = 500;
    const q = new Queue<[number, number]>();
    let i = 0;
    let sum = 0;
    const res: number[] = [];

    for (let t = 0; t < durationInMs; t += TIME_STEP) {
      while (i < map.objects.length) {
        const o = map.objects[i];
        if (t + TIME_STEP < o.time) {
          break;
        }
        const strainTotal = d.objects[i].strains[0] + d.objects[i].strains[1];
        q.enqueue([o.time, strainTotal]);
        sum += strainTotal;
        i++;
      }
      while (!q.isEmpty()) {
        const [time, totalStrain] = q.peek() as [number, number];
        if (time > t - TIME_STEP) {
          break;
        }
        sum -= totalStrain;
        q.dequeue();
      }
      res.push(q.isEmpty() ? 0 : sum / q.size());
    }
    if (res.length > 0) {
      const m = max(res);
      if (m > 0) {
        const normalizedRes = res.map((r) => r / m);
        this.difficulties$.next(normalizedRes);
      }
    }
  }

  calculateHitErrorArray() {}

  simulateReplay(beatmap: Beatmap, replay: OsuReplay) {
    this.gameplayTimeMachine = new BucketedGameStateTimeMachine(replay.frames, beatmap, {
      hitWindowStyle: "OSU_STABLE",
      noteLockStyle: "STABLE",
    });
    this.gameplayEvaluator = new GameplayInfoEvaluator(beatmap, {});
    this.lastState = this.gameplayTimeMachine.gameStateAt(1e9);
    this.currentInfo = defaultGameplayInfo;
    this.replayEvents$.next(retrieveEvents(this.lastState, beatmap.hitObjects));
    this.judgements = this.replayEvents$.getValue().filter(isHitObjectJudgement);

    this.hits = [];
    if (!this.lastState) return;

    for (const id of this.lastState.judgedObjects) {
      const h = beatmap.getHitObject(id);
      if (h.type === "HIT_CIRCLE") {
        const s = this.lastState.hitCircleVerdict[id];
        const hitCircle = beatmap.getHitCircle(id);
        const offset = s.judgementTime - hitCircle.hitTime;
        const hit = s.type !== "MISS";
        this.hits.push([s.judgementTime, offset, hit]);
      }
    }
    this.hits.sort((a, b) => a[0] - b[0]);

    this.coach$.next(analyseMistakes(beatmap, replay.frames, this.lastState));
  }

  simulate(gameTimeInMs: number) {
    if (this.gameplayTimeMachine && this.gameplayEvaluator) {
      this.currentState = this.gameplayTimeMachine.gameStateAt(gameTimeInMs);
      this.currentInfo = this.gameplayEvaluator.evaluateReplayState(this.currentState!);
    }
  }

  getCurrentState() {
    return this.currentState;
  }

  getCurrentInfo() {
    return this.currentInfo;
  }

  async calculateEvents() {}

  clear() {
    this.replayEvents$.next([]);
    this.difficulties$.next([]);
    this.coach$.next(null);
  }
}
