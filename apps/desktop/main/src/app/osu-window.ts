import { execFile } from "child_process";

export function parseTasklistWindowTitle(csv: string): string | null {
  const line = csv.split(/\r?\n/).find((l) => l.toLowerCase().startsWith('"osu!.exe"'));
  if (!line) return null;
  const fields = line.match(/"((?:[^"]|"")*)"/g)?.map((f) => f.slice(1, -1).replace(/""/g, '"')) ?? [];
  return fields.length > 0 ? fields[fields.length - 1] : null;
}

export function isPlayingTitle(title: string | null): boolean {
  if (!title) return false;
  return /^osu!\s*-\s*.+/i.test(title.trim());
}

export function readOsuWindowTitle(): Promise<string | null> {
  if (process.platform !== "win32") return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      "tasklist",
      ["/FI", "IMAGENAME eq osu!.exe", "/V", "/NH", "/FO", "CSV"],
      { windowsHide: true },
      (error, stdout) => resolve(error ? null : parseTasklistWindowTitle(stdout)),
    );
  });
}
