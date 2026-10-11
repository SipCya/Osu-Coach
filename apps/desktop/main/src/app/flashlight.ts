import { BrowserWindow, Display, globalShortcut, ipcMain, screen } from "electron";
import { frontendUrl } from "./frontend-url";
import { readGameplay } from "./tosu";
import { isPlayingTitle, readOsuWindowTitle } from "./osu-window";
import { windows } from "./windows";

export interface FlashlightSettings {
  displayId: number;
  radius: number;
  darkness: number;
  softness: number;
  comboShrink: boolean;
  onlyWhilePlaying: boolean;
}

export type GameSource = "tosu" | "window" | "none";

export interface FlashlightStatus {
  running: boolean;
  hidden: boolean;
  source: GameSource | null;
}

export const FLASHLIGHT_HOTKEY = "CommandOrControl+Shift+F";
const CURSOR_INTERVAL_MS = 4;
const GAME_INTERVAL_MS = 150;
const WINDOW_TITLE_INTERVAL_MS = 500;

let overlay: BrowserWindow | null = null;
let settings: FlashlightSettings | null = null;
let bounds = { x: 0, y: 0, width: 0, height: 0 };
let hidden = false;
let cursorTimer: ReturnType<typeof setInterval> | null = null;
let gameTimer: ReturnType<typeof setInterval> | null = null;
let lastCursor = { x: Number.NaN, y: Number.NaN };
let readingGame = false;
let source: GameSource | null = null;
let lastTitleCheck = 0;

function displayFor(id: number): Display {
  return screen.getAllDisplays().find((d) => d.id === id) ?? screen.getPrimaryDisplay();
}

function status(): FlashlightStatus {
  return { running: overlay !== null, hidden, source: overlay ? source : null };
}

function setSource(next: GameSource | null) {
  if (next === source) return;
  source = next;
  notifyStatus();
}

function notifyStatus() {
  windows.frontend?.webContents.send("fl:status", status());
}

function sendSettings() {
  overlay?.webContents.send("fl:settings", { ...settings, height: bounds.height });
}

function needsGame() {
  return !!settings && (settings.comboShrink || settings.onlyWhilePlaying);
}

function startGameTimer() {
  if (gameTimer || !needsGame()) return;
  gameTimer = setInterval(async () => {
    if (readingGame || !overlay) return;
    readingGame = true;
    try {
      const tosu = await readGameplay();
      if (tosu) {
        setSource("tosu");
        overlay?.webContents.send("fl:game", tosu);
        return;
      }
      if (Date.now() - lastTitleCheck < WINDOW_TITLE_INTERVAL_MS) return;
      lastTitleCheck = Date.now();
      const title = await readOsuWindowTitle();
      setSource(title === null ? "none" : "window");
      overlay?.webContents.send("fl:game", { playing: isPlayingTitle(title), combo: 0 });
    } finally {
      readingGame = false;
    }
  }, GAME_INTERVAL_MS);
}

function stopGameTimer() {
  if (gameTimer) clearInterval(gameTimer);
  gameTimer = null;
  source = null;
  lastTitleCheck = 0;
}

function stopTimers() {
  if (cursorTimer) clearInterval(cursorTimer);
  cursorTimer = null;
  stopGameTimer();
}

function toggleHidden() {
  if (!overlay) return;
  hidden = !hidden;
  if (hidden) overlay.hide();
  else overlay.showInactive();
  notifyStatus();
}

function startOverlay(next: FlashlightSettings) {
  settings = next;
  bounds = displayFor(next.displayId).bounds;
  if (overlay) {
    overlay.setBounds(bounds);
    sendSettings();
    stopGameTimer();
    startGameTimer();
    return status();
  }

  overlay = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
    },
  });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setIgnoreMouseEvents(true);
  overlay.webContents.on("did-finish-load", () => {
    sendSettings();
    if (!hidden) overlay?.showInactive();
  });
  overlay.on("closed", () => {
    overlay = null;
    hidden = false;
    stopTimers();
    globalShortcut.unregister(FLASHLIGHT_HOTKEY);
    notifyStatus();
  });
  void overlay.loadURL(frontendUrl("/fl-overlay"));

  lastCursor = { x: Number.NaN, y: Number.NaN };
  cursorTimer = setInterval(() => {
    if (!overlay || hidden) return;
    const point = screen.getCursorScreenPoint();
    if (point.x === lastCursor.x && point.y === lastCursor.y) return;
    lastCursor = point;
    overlay.webContents.send("fl:cursor", point.x - bounds.x, point.y - bounds.y);
  }, CURSOR_INTERVAL_MS);
  startGameTimer();
  if (!globalShortcut.isRegistered(FLASHLIGHT_HOTKEY)) globalShortcut.register(FLASHLIGHT_HOTKEY, toggleHidden);
  return status();
}

export function closeFlashlightOverlay() {
  overlay?.close();
}

export function setupFlashlightListeners() {
  ipcMain.handle("fl:displays", () => {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d) => ({
      id: d.id,
      width: d.bounds.width,
      height: d.bounds.height,
      scaleFactor: d.scaleFactor,
      primary: d.id === primary,
    }));
  });
  ipcMain.handle("fl:start", (event, next: FlashlightSettings) => startOverlay(next));
  ipcMain.handle("fl:stop", () => {
    closeFlashlightOverlay();
    return { running: false, hidden: false, source: null };
  });
  ipcMain.handle("fl:status", () => status());
}
