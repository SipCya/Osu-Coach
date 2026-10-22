import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from "electron";
import { menuTexts } from "./menu-i18n";
import { setupEventListeners } from "./app/events";
import { setupSpeedAudioListeners } from "./app/speed-audio";
import { setupTosuListeners } from "./app/tosu";
import { windows } from "./app/windows";
import log from "electron-log";
import { join } from "path";
import { frontendUrl, isDevelopmentMode } from "./app/frontend-url";
import { closeFlashlightOverlay, setupFlashlightListeners } from "./app/flashlight";

const DEFAULT_WIDTH = 1600;
const DEFAULT_HEIGHT = 900;
const MIN_WIDTH = 1024;
const MIN_HEIGHT = 600;

function createFrontendWindow() {
  const workAreaSize = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(DEFAULT_WIDTH, workAreaSize.width || DEFAULT_WIDTH);
  const height = Math.min(DEFAULT_HEIGHT, workAreaSize.height || DEFAULT_HEIGHT);
  const minWidth = Math.min(MIN_WIDTH, workAreaSize.width || MIN_WIDTH);
  const minHeight = Math.min(MIN_HEIGHT, workAreaSize.height || MIN_HEIGHT);

  const isDev = isDevelopmentMode();
  const frontend = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
    show: false,
    webPreferences: {
      webSecurity: !isDev,
      backgroundThrottling: true,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  frontend.center();
  frontend.on("ready-to-show", () => {
    windows.frontend?.show();
  });
  frontend.on("closed", () => {
    windows.frontend = null;
    closeFlashlightOverlay();
    app.quit();
  });
  frontend.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });

  ipcMain.on("osuFolderChanged", (event, folder: string) => {
    menuState.osuFolder = folder;
    Menu.setApplicationMenu(createMenu(menuState.osuFolder));
  });
  void frontend.loadURL(frontendUrl());

  windows.frontend = frontend;
}

function handleAllWindowClosed() {
  if (process.platform !== "darwin") {
    app.quit();
  }
}

function handleReady() {
  const isDev = isDevelopmentMode();

  Menu.setApplicationMenu(createMenu(null));

  console.log(
    "Booting Electron application with settings: ",
    JSON.stringify({
      isDev,
      appDataPath: app.getPath("appData"),
    }),
  );

  createFrontendWindow();
}

function handleActivate() {
  if (windows.frontend === null) {
    handleReady();
  }
}

(function main() {
  Object.assign(console, log.functions);

  const isLocked = app.requestSingleInstanceLock();
  if (!isLocked) app.quit();

  app.setAppUserModelId("local.osucoach.app");

  app.commandLine.appendSwitch("disable-features", "HardwareMediaKeyHandling");

  app.commandLine.appendSwitch("ignore-gpu-blocklist");

  setupEventListeners();
  setupSpeedAudioListeners();
  setupTosuListeners();
  setupFlashlightListeners();

  app.on("window-all-closed", handleAllWindowClosed);
  app.on("ready", handleReady);
  app.on("activate", handleActivate);
})();

const menuState: { osuFolder: string | null } = { osuFolder: null };

function createMenu(osuFolder: string | null) {
  const osuFolderKnown = !!osuFolder as boolean;
  const tx = menuTexts;
  const isMac = process.platform === "darwin";

  const template: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = [];
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        {
          role: "about",
          label: tx.about,
        },
        {
          type: "separator",
        },
        {
          role: "services",
          label: tx.services,
        },
        {
          type: "separator",
        },
        {
          role: "hide",
          label: tx.hide,
        },
        {
          role: "hideOthers",
          label: tx.hideOthers,
        },
        {
          role: "unhide",
          label: tx.unhide,
        },
        {
          type: "separator",
        },
        {
          role: "quit",
          label: tx.quit,
        },
      ],
    });
  }

  template.push(
    {
      label: tx.file,
      submenu: [
        {
          label: tx.openReplay,
          accelerator: "CommandOrControl+O",
          enabled: osuFolderKnown,
          click: async () => {
            const { canceled, filePaths } = await dialog.showOpenDialog({
              defaultPath: join(osuFolder ?? "", "Replays"),
              properties: ["openFile"],
              filters: [
                { name: tx.replayFilter, extensions: ["osr"] },
                { name: tx.allFiles, extensions: ["*"] },
              ],
            });
            if (!canceled && filePaths.length > 0) {
              const file = filePaths[0];
              windows.frontend?.webContents.send("onManualReplayOpen", file);
            }
          },
        },
        { type: "separator" },
        {
          label: tx.openInstallFolder,
          click: async () => {
            await shell.showItemInFolder(app.getPath("exe"));
          },
        },
        {
          label: tx.openConfigFolder,
          click: async () => {
            await shell.openPath(app.getPath("userData"));
          },
        },
        {
          label: tx.openLogsFolder,
          click: async () => {
            await shell.openPath(app.getPath("logs"));
          },
        },
        { type: "separator" },
        {
          label: tx.openOsuFolder,
          click: async () => {
            if (osuFolder) await shell.openPath(osuFolder);
          },
          enabled: osuFolderKnown,
        },
        { type: "separator" },
        { role: "close", label: tx.close },
      ],
    },
    {
      label: tx.view,
      submenu: [
        { role: "reload", label: tx.reload },
        { role: "forceReload", label: tx.forceReload },
        { type: "separator" },
        { role: "toggleDevTools", label: tx.devTools },
      ],
    },
    {
      label: tx.help,
      submenu: [
        {
          label: tx.documentation,
          click: async () => {
            await shell.openExternal("https://github.com/SipCya/Osu-Coach");
          },
        },
        {
          label: "Discord",
          click: async () => {
            await shell.openExternal("https://discord.gg/QubdHdnBVg");
          },
        },
        { type: "separator" },
        {
          label: tx.about,
          click: async () => {
            const aboutMessage = tx.aboutMessage.replace("{version}", app.getVersion());
            await dialog.showMessageBox({
              title: tx.aboutTitle,
              type: "info",
              message: aboutMessage,
            });
          },
        },
      ],
    },
  );

  return Menu.buildFromTemplate(template);
}
