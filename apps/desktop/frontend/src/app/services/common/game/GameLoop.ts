import * as PIXI from "pixi.js";
import { GameplayClock } from "./GameplayClock";
import { PixiRendererManager } from "../../renderers/PixiRendererManager";
import { injectable, postConstruct } from "inversify";
import { SceneManager } from "../scenes/SceneManager";
import MrDoobStats from "stats.js";

function defaultMonitor() {
  const s = new MrDoobStats();
  s.dom.style.position = "absolute";
  s.dom.style.left = "0px";
  s.dom.style.top = "0px";
  s.dom.style.zIndex = "9000";
  return s;
}

@injectable()
export class GameLoop {
  private ticker: PIXI.Ticker;
  private readonly performanceMonitor: MrDoobStats;

  constructor(
    private gameClock: GameplayClock,
    private sceneManager: SceneManager,
    private pixiRendererService: PixiRendererManager,
  ) {
    this.ticker = new PIXI.Ticker();
    this.performanceMonitor = defaultMonitor();
  }

  stats() {
    return this.performanceMonitor.dom;
  }

  @postConstruct()
  initializeTicker() {
    this.ticker.add(this.tickHandler.bind(this));
  }

  startTicker() {
    this.ticker.start();
  }

  stopTicker() {
    this.ticker.stop();
  }

  private update(deltaTimeMs: number) {
    this.sceneManager.update(deltaTimeMs);
  }

  private render() {
    const renderer = this.pixiRendererService.getRenderer();
    if (renderer) {
      this.pixiRendererService.resizeCanvasToDisplaySize();
      renderer.render(this.sceneManager.createStage());
    }
  }

  tickHandler(deltaTimeMs: number) {
    this.performanceMonitor.begin();
    this.update(deltaTimeMs);
    this.render();
    this.performanceMonitor.end();
  }
}
