import { Container } from "pixi.js";

export interface UserScene {
  init(data: unknown): void;

  preload(): Promise<void>;

  create(): void;

  update(deltaTimeInMs: number): void;

  destroy(): void;

  stage: Container;
}

type ManagedSceneState = "INITIALIZING" | "PLAYING" | "PAUSED" | "SLEEPING";

export class ManagedScene implements UserScene {
  state: ManagedSceneState = "INITIALIZING";

  constructor(private readonly scene: UserScene, public readonly key: string) {}

  get stage() {
    return this.scene.stage;
  }

  pause() {
    this.state = "PAUSED";
  }

  resume() {
    this.state = "PLAYING";
  }

  sleep() {
    this.state = "SLEEPING";
  }

  destroy(): void {
    return this.scene.destroy();
  }

  init(data: unknown): void {
    return this.scene.init(data);
  }

  async preload(): Promise<void> {
    return this.scene.preload();
  }

  update(deltaTimeInMs: number): void {
    if (this.state === "PLAYING") {
      return this.scene.update(deltaTimeInMs);
    }
  }

  create(): void {
    return this.scene.create();
  }
}
