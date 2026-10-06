import { ipcMain } from "electron";
import { get } from "http";

const TOSU_URL = "http://127.0.0.1:24050/json";

export interface TosuSnapshot {
  songsFolder: string;
  folder: string;
  file: string;
  artist: string;
  title: string;
  difficulty: string;
}

function fetchJson(url: string, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = get(url, { timeout: timeoutMs }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
  });
}

export async function readTosu(): Promise<TosuSnapshot | null> {
  try {
    const json = await fetchJson(TOSU_URL, 1500);
    const bm = json?.menu?.bm ?? {};
    const meta = bm.metadata ?? {};
    return {
      songsFolder: json?.settings?.folders?.songs ?? "",
      folder: bm.path?.folder ?? "",
      file: bm.path?.file ?? "",
      artist: meta.artist ?? "",
      title: meta.title ?? "",
      difficulty: meta.difficulty ?? "",
    };
  } catch {
    return null;
  }
}

export function setupTosuListeners() {
  ipcMain.handle("tosuSnapshot", () => readTosu());
}
