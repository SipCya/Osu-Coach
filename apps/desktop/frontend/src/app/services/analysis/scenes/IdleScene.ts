import { UserScene } from "../../common/scenes/IScene";
import { Container } from "pixi.js";
import { injectable } from "inversify";

@injectable()
export class IdleScene implements UserScene {
  stage = new Container();

  destroy(): void {
    this.stage.destroy();
  }

  init(data: string): void {}

  async preload(): Promise<void> {}

  update(): void {}

  create(): void {
    this.stage = new Container();
  }
}
