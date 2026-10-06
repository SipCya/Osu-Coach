import { injectable } from "inversify";
import { Subject } from "rxjs";
import * as chokidar from "chokidar";
import { OsuFolderService } from "./OsuFolderService";

@injectable()
export class ReplayFileWatcher {
  public readonly newReplays$: Subject<string>;
  private watcher?: chokidar.FSWatcher;

  constructor(private readonly osuFolderService: OsuFolderService) {
    this.newReplays$ = new Subject<string>();
  }

  public startWatching() {
    this.osuFolderService.replaysFolder$.subscribe(this.onNewReplayFolder.bind(this));
  }

  private onNewReplayFolder(folder: string) {
    if (this.watcher) {
      void this.watcher.close();
    }

    const globPattern = folder;
    console.log(`Watching for replays (.osr) in folder: ${folder} with pattern: ${globPattern}`);
    this.watcher = chokidar.watch(globPattern, {
      ignoreInitial: true,
      persistent: true,
      depth: 0,
    });
    this.watcher.on("ready", () => {
      console.log("");
    });
    this.watcher.on("add", (path) => {
      if (!path.endsWith(".osr")) {
        return;
      }
      console.log(`Detected new file at: ${path}`);
      this.newReplays$.next(path);
    });
  }
}
