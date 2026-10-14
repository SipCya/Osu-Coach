import { app, dialog, ipcMain } from "electron";
import { read } from "node-osr";
import { existsSync } from "fs";
import { join } from "path";

async function userSelectDirectory(defaultPath: string) {
  const { canceled, filePaths } = await dialog.showOpenDialog({ defaultPath, properties: ["openDirectory"] });
  if (canceled || filePaths.length === 0) {
    return null;
  } else {
    return filePaths[0];
  }
}

async function userSelectFile(defaultPath: string) {
  const { canceled, filePaths } = await dialog.showOpenDialog({ defaultPath, properties: ["openFile"] });
  if (canceled || filePaths.length === 0) {
    return null;
  } else {
    return filePaths[0];
  }
}

async function userSelectSaveFile(defaultPath: string, filters?: { name: string; extensions: string[] }[]) {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath,
    filters: filters ?? [{ name: "PNG", extensions: ["png"] }],
  });
  return canceled || !filePath ? null : filePath;
}

function appResourcesPath() {
  if (app.isPackaged) return process.resourcesPath;
  const projectResources = join(process.cwd(), "resources");
  return existsSync(join(projectResources, "Skins")) ? projectResources : process.resourcesPath;
}

function getPath(type: string) {
  switch (type) {
    case "appData":
      return app.getPath("appData");
    case "userData":
      return app.getPath("userData");
    case "logs":
      return app.getPath("logs");
    case "desktop":
      return app.getPath("desktop");
    case "videos":
      return app.getPath("videos");
    case "appResources":
      return appResourcesPath();
  }
  return "";
}

export function setupEventListeners() {
  ipcMain.handle("getPath", (event, type) => getPath(type));
  ipcMain.handle("selectDirectory", (event, defaultPath) => userSelectDirectory(defaultPath));
  ipcMain.handle("selectFile", (event, defaultPath) => userSelectFile(defaultPath));
  ipcMain.handle("selectSaveFile", (event, defaultPath, filters) => userSelectSaveFile(defaultPath, filters));
  ipcMain.handle("getPlatform", () => process.platform);
  ipcMain.handle("getAppVersion", () => app.getVersion());
  ipcMain.handle("reboot", () => {
    app.relaunch();
    app.quit();
  });

  ipcMain.handle("readOsr", async (event, filePath) => {
    return await read(filePath);
  });
}
