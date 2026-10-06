import { ipcMain } from "electron";
import ffmpegStatic = require("ffmpeg-static");
import { execFile } from "child_process";
import { existsSync } from "fs";
import { rename, unlink } from "fs/promises";

export interface SpeedAudioRequest {
  input: string;
  output: string;
  rate: number;
  changePitch: boolean;
}

function ffmpegPath(): string {
  const path: string = ffmpegStatic;
  return path.replace("app.asar", "app.asar.unpacked");
}

function run(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath(), args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim().split("\n").pop() || error.message));
      else resolve({ stdout, stderr });
    });
  });
}

async function sampleRate(input: string): Promise<number> {
  let info = "";
  try {
    info = (await run(["-hide_banner", "-i", input])).stderr;
  } catch (e) {
    info = (e as Error).message;
  }
  const match = /Audio:.*?(\d{4,6}) Hz/.exec(info);
  return match ? Number(match[1]) : 44100;
}

function tempoChain(rate: number): string {
  const filters: string[] = [];
  let remaining = rate;
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(6)}`);
  return filters.join(",");
}

export async function createSpeedAudio({ input, output, rate, changePitch }: SpeedAudioRequest) {
  if (!existsSync(input)) throw new Error(`File audio non trovato: ${input}`);
  if (existsSync(output)) return { output, reused: true };

  let filter = tempoChain(rate);
  if (changePitch) {
    const sr = await sampleRate(input);
    filter = `asetrate=${Math.round(sr * rate)},aresample=${sr}`;
  }
  const temp = `${output}.part.mp3`;
  try {
    await run([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      input,
      "-vn",
      "-filter:a",
      filter,
      "-c:a",
      "libmp3lame",
      "-q:a",
      "2",
      temp,
    ]);
    await rename(temp, output);
  } catch (e) {
    await unlink(temp).catch(() => undefined);
    throw e;
  }
  return { output, reused: false };
}

export function setupSpeedAudioListeners() {
  ipcMain.handle("speedChangeAudio", (event, request: SpeedAudioRequest) => createSpeedAudio(request));
}
