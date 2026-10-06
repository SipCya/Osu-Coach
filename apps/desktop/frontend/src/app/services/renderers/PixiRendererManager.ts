import * as PIXI from "pixi.js";
import { injectable } from "inversify";

@injectable()
export class PixiRendererManager {
  private renderer?: PIXI.Renderer;
  private canvas?: HTMLCanvasElement;
  private pendingDestroy?: ReturnType<typeof setTimeout>;

  initializeRenderer(canvas: HTMLCanvasElement) {
    if (this.pendingDestroy) {
      clearTimeout(this.pendingDestroy);
      this.pendingDestroy = undefined;
      if (this.renderer && this.canvas === canvas) {
        this.resizeCanvasToDisplaySize();
        return;
      }
      this.destroyNow();
    }
    this.canvas = canvas;
    this.renderer = new PIXI.Renderer({ view: canvas, antialias: true });
    this.resizeCanvasToDisplaySize();
  }

  resizeCanvasToDisplaySize() {
    const canvas = this.canvas;
    if (!canvas || !this.renderer) {
      return false;
    }
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      this.renderer.resize(canvas.clientWidth, canvas.clientHeight);
      console.log(`Canvas dimensions have been set to ${canvas.width} x ${canvas.height}`);
      return true;
    }
    return false;
  }

  destroy() {
    if (this.pendingDestroy) return;
    this.pendingDestroy = setTimeout(() => {
      this.pendingDestroy = undefined;
      this.destroyNow();
    }, 0);
  }

  private destroyNow() {
    this.renderer?.clear();
    this.renderer?.destroy();
    this.renderer = undefined;
  }

  getRenderer(): PIXI.Renderer | undefined {
    return this.renderer;
  }
}
