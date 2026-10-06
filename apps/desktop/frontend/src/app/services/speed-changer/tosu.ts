import { BehaviorSubject } from "rxjs";
import { ipcRenderer } from "electron";
import { join } from "path";

export type TosuStatus = "connecting" | "connected" | "offline";

export interface SelectedMap {
  path: string;
  folder: string;
  label: string;
}

interface TosuSnapshot {
  songsFolder: string;
  folder: string;
  file: string;
  artist: string;
  title: string;
  difficulty: string;
}

const POLL_MS = 1000;

class TosuWatcher {
  status$ = new BehaviorSubject<TosuStatus>("connecting");
  map$ = new BehaviorSubject<SelectedMap | null>(null);

  private timer: ReturnType<typeof setInterval> | null = null;
  private users = 0;
  private busy = false;

  start() {
    this.users++;
    if (this.users === 1) {
      void this.poll();
      this.timer = setInterval(() => void this.poll(), POLL_MS);
    }
  }

  stop() {
    this.users = Math.max(0, this.users - 1);
    if (this.users === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      const snapshot: TosuSnapshot | null = await ipcRenderer.invoke("tosuSnapshot");
      if (!snapshot) {
        this.status$.next("offline");
        return;
      }
      if (this.status$.value !== "connected") this.status$.next("connected");
      const { songsFolder, folder, file } = snapshot;
      if (!songsFolder || !folder || !file) return;
      const path = join(songsFolder, folder, file);
      if (this.map$.value?.path === path) return;
      this.map$.next({
        path,
        folder: join(songsFolder, folder),
        label: `${snapshot.artist} - ${snapshot.title} [${snapshot.difficulty}]`,
      });
    } finally {
      this.busy = false;
    }
  }
}

export const tosuWatcher = new TosuWatcher();
