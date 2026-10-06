import { execFile } from "child_process";

export function isOsuRunning(): Promise<boolean> {
  if (process.platform !== "win32") return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile(
      "tasklist",
      ["/FI", "IMAGENAME eq osu!.exe", "/NH", "/FO", "CSV"],
      { windowsHide: true },
      (error, stdout) => resolve(!error && stdout.toLowerCase().includes('"osu!.exe"')),
    );
  });
}
