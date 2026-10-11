import { useEffect, useRef } from "react";
import { ipcRenderer } from "electron";
import { FlashlightSettings, holeRadiusPx } from "../../services/flashlight/flashlight-math";

interface OverlaySettings extends FlashlightSettings {
  height: number;
}

interface Gameplay {
  playing: boolean;
  combo: number;
}

export function FlashlightOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let settings: OverlaySettings | null = null;
    let game: Gameplay | null = null;
    let cursor = { x: -10000, y: -10000 };
    let dirty = true;
    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
    };
    resize();

    const onSettings = (_: unknown, next: OverlaySettings) => {
      settings = next;
      dirty = true;
    };
    const onCursor = (_: unknown, x: number, y: number) => {
      cursor = { x, y };
      dirty = true;
    };
    const onGame = (_: unknown, next: Gameplay | null) => {
      game = next;
      dirty = true;
    };
    ipcRenderer.on("fl:settings", onSettings);
    ipcRenderer.on("fl:cursor", onCursor);
    ipcRenderer.on("fl:game", onGame);
    window.addEventListener("resize", resize);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!dirty) return;
      dirty = false;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (!settings) return;
      if (settings.onlyWhilePlaying && game && !game.playing) return;
      const radius = holeRadiusPx(settings, settings.height, game?.combo ?? 0, settings.comboShrink);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(0,0,0,${settings.darkness})`;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalCompositeOperation = "destination-out";
      const inner = Math.max(0, radius * (1 - settings.softness));
      const gradient = ctx.createRadialGradient(cursor.x, cursor.y, inner, cursor.x, cursor.y, radius);
      gradient.addColorStop(0, "rgba(0,0,0,1)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ipcRenderer.removeListener("fl:settings", onSettings);
      ipcRenderer.removeListener("fl:cursor", onCursor);
      ipcRenderer.removeListener("fl:game", onGame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ display: "block", position: "fixed", inset: 0, pointerEvents: "none" }} />;
}
