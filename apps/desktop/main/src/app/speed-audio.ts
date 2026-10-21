import { ipcMain } from "electron";
import ffmpegStatic = require("ffmpeg-static");
import { execFile, spawn, ChildProcessWithoutNullStreams } from "child_process";
import { once } from "events";
import { existsSync } from "fs";
import { rename, unlink } from "fs/promises";
import { join } from "path";
import { buildMashupFilter, MashupPlan } from "./mashup-filter";

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
      if (error) {
        const lines = stderr.trim().split("\n").filter(Boolean);
        reject(new Error(lines.slice(-6).join(" | ") || error.message));
      } else resolve({ stdout, stderr });
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

export interface TrimAudioRequest {
  input: string;
  output: string;
  startMs: number;
  endMs: number;
}

export async function createTrimmedAudio({ input, output, startMs, endMs }: TrimAudioRequest) {
  if (!existsSync(input)) throw new Error(`File audio non trovato: ${input}`);
  const start = Math.max(0, startMs) / 1000;
  const duration = Math.max(0, endMs - startMs) / 1000;
  if (duration <= 0) throw new Error("Intervallo audio non valido");

  const temp = `${output}.part.mp3`;
  try {
    await run([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      start.toFixed(3),
      "-i",
      input,
      "-t",
      duration.toFixed(3),
      "-vn",
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
  return { output };
}

export interface CompileMashupRequest {
  /** One file per segment; segment N reads input N (same file may repeat). */
  inputs: string[];
  plan: MashupPlan;
  output: string;
}

export interface MashupProgress {
  value: number; // 0..1
  elapsedMs: number;
}

/**
 * Stitch several audio slices into a single mp3 (gaps / crossfades / fades / per-segment rate).
 * Streams ffmpeg's `-progress` output so callers can show a determinate bar and ETA.
 */
export async function createMashup(
  { inputs, plan, output }: CompileMashupRequest,
  onProgress?: (p: MashupProgress) => void,
) {
  if (inputs.length === 0 || plan.segments.length === 0) throw new Error("Nessun segmento da unire");
  for (const f of inputs) {
    if (!existsSync(f)) throw new Error(`File audio non trovato: ${f}`);
  }
  const { filterComplex, outLabel, totalMs } = buildMashupFilter(plan);
  const temp = `${output}.part.mp3`;
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-progress", "pipe:1", "-nostats"];
  for (const f of inputs) args.push("-i", f);
  args.push("-filter_complex", filterComplex, "-map", `[${outLabel}]`, "-c:a", "libmp3lame", "-q:a", "2", temp);

  const started = Date.now();
  const proc = spawn(ffmpegPath(), args, { windowsHide: true });
  let stderr = "";
  let stdoutBuf = "";
  proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  proc.stdout.on("data", (d: Buffer) => {
    stdoutBuf += d.toString();
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop() ?? "";
    for (const line of lines) {
      const m = /^out_time_us=(\d+)/.exec(line.trim());
      if (m && totalMs > 0 && onProgress) {
        const doneMs = Number(m[1]) / 1000;
        onProgress({ value: Math.max(0, Math.min(1, doneMs / totalMs)), elapsedMs: Date.now() - started });
      }
    }
  });

  try {
    const [code] = (await once(proc, "close")) as [number];
    if (code !== 0) {
      const tail = stderr.trim().split("\n").filter(Boolean).slice(-6).join(" | ");
      throw new Error(tail || `ffmpeg exited with code ${code}`);
    }
    await rename(temp, output);
    onProgress?.({ value: 1, elapsedMs: Date.now() - started });
  } catch (e) {
    await unlink(temp).catch(() => undefined);
    throw e;
  }
  return { output };
}

export interface ConvertToMp4Request {
  input: string;
  output: string;
  fps: number;
  /** Target output height; width follows the aspect ratio. Omit to keep the captured size. */
  height?: number;
  crf?: number;
}

export async function convertToMp4({ input, output, height, crf }: ConvertToMp4Request) {
  if (!existsSync(input)) throw new Error(`File video non trovato: ${input}`);
  // libx264 needs even dimensions and yuv420p; always normalise both in the filter chain.
  const scale = height && height > 0 ? `scale=-2:${height}` : "scale=trunc(iw/2)*2:trunc(ih/2)*2";
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input,
    "-vf",
    `${scale},format=yuv420p`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    String(crf ?? 20),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    output,
  ];
  await run(args);
  return { output };
}

// --- Offline video assembly (osr2mp4-style: render frames, then encode with ffmpeg) ---

let cachedEncoder: string | null = null;

async function encoderWorks(encoder: string): Promise<boolean> {
  try {
    await run([
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=64x64:rate=1:d=1",
      "-frames:v",
      "1",
      "-c:v",
      encoder,
      "-f",
      "null",
      "-",
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Picks the best available H.264 encoder: GPU (NVIDIA/AMD/Intel) if it works, else libx264. */
export async function detectH264Encoder(): Promise<string> {
  if (cachedEncoder) return cachedEncoder;
  for (const encoder of ["h264_nvenc", "h264_amf", "h264_qsv"]) {
    if (await encoderWorks(encoder)) {
      cachedEncoder = encoder;
      return encoder;
    }
  }
  cachedEncoder = "libx264";
  return cachedEncoder;
}

function encoderArgs(encoder: string, crf: number): string[] {
  switch (encoder) {
    case "h264_nvenc":
      return ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", String(crf)];
    case "h264_amf":
      return ["-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", String(crf), "-qp_p", String(crf)];
    case "h264_qsv":
      return ["-c:v", "h264_qsv", "-global_quality", String(crf)];
    default:
      return ["-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf)];
  }
}

export interface AssembleVideoRequest {
  framesDir: string;
  framePattern: string; // e.g. "f_%06d.png"
  sourceFps: number;
  outputFps: number;
  audioPath?: string;
  audioTempo?: number; // atempo for DT/HT; 1 = unchanged
  tmixFrames?: number; // >1 enables motion-blur resampling
  upscaleHeight?: number; // lanczos upscale target height
  crf: number;
  encoder: string;
  output: string;
}

export async function assembleVideo(req: AssembleVideoRequest) {
  const vf: string[] = [];
  if (req.tmixFrames && req.tmixFrames > 1) {
    vf.push(`tmix=frames=${req.tmixFrames}:weights=${Array(req.tmixFrames).fill("1").join(" ")}`);
  }
  if (req.upscaleHeight && req.upscaleHeight > 0) vf.push(`scale=-2:${req.upscaleHeight}:flags=lanczos`);
  vf.push("format=yuv420p");

  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-framerate",
    String(req.sourceFps),
    "-i",
    join(req.framesDir, req.framePattern),
  ];
  if (req.audioPath) args.push("-i", req.audioPath);
  args.push("-vf", vf.join(","), "-r", String(req.outputFps));
  args.push(...encoderArgs(req.encoder, req.crf));
  if (req.audioPath) {
    if (req.audioTempo && Math.abs(req.audioTempo - 1) > 1e-6) args.push("-filter:a", tempoChain(req.audioTempo));
    args.push("-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest");
  }
  args.push(req.output);
  await run(args);
  return { output: req.output };
}

// --- Streaming video export: raw RGBA frames piped straight into ffmpeg (osr2mp4-style) ---

export interface VideoStreamStartRequest {
  width: number;
  height: number;
  sourceFps: number;
  outputFps: number;
  tmixFrames?: number; // motion-blur frame blending
  upscaleHeight?: number;
  crf: number;
  encoder: string;
  audioPath?: string;
  audioTempo?: number;
  output: string;
}

let exportProc: ChildProcessWithoutNullStreams | null = null;
let exportStderr = "";

// Frames arrive over a MessagePort (not per-frame IPC) and are written to ffmpeg's stdin
// one at a time; an { ack } is posted back per frame so the renderer can window its sends.
let framePort: Electron.MessagePortMain | null = null;
let frameQueue: Buffer[] = [];
let draining = false;

function exportError(code: number | null): Error {
  const tail = exportStderr.trim().split("\n").filter(Boolean).slice(-6).join(" | ");
  return new Error(tail || `ffmpeg exited with code ${code}`);
}

async function drainFrames(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (frameQueue.length > 0) {
      const proc = exportProc;
      if (!proc || !proc.stdin.writable) {
        // ffmpeg is gone: drop the backlog and let the renderer stop waiting for acks.
        frameQueue = [];
        framePort?.postMessage({ fail: 1 });
        break;
      }
      const frame = frameQueue.shift() as Buffer;
      if (!proc.stdin.write(frame)) await once(proc.stdin, "drain");
      framePort?.postMessage({ ack: 1 });
    }
  } finally {
    draining = false;
  }
}

function attachFramePort(port: Electron.MessagePortMain): void {
  detachFramePort();
  framePort = port;
  frameQueue = [];
  port.on("message", (e) => {
    const data = e.data as ArrayBuffer | null;
    if (data) {
      frameQueue.push(Buffer.from(data));
      void drainFrames();
    }
  });
  port.start();
}

function detachFramePort(): void {
  try {
    framePort?.close();
  } catch {
    /* already closed */
  }
  framePort = null;
  frameQueue = [];
}

export function videoExportStart(req: VideoStreamStartRequest): void {
  // A previous export may have left ffmpeg running (e.g. the renderer was interrupted before it
  // finished/cancelled). Reclaim it instead of refusing to start a new one.
  if (exportProc) {
    try {
      exportProc.kill();
    } catch {
      /* already gone */
    }
    exportProc = null;
    detachFramePort();
  }

  const vf: string[] = [];
  if (req.tmixFrames && req.tmixFrames > 1) {
    vf.push(`tmix=frames=${req.tmixFrames}:weights=${Array(req.tmixFrames).fill("1").join(" ")}`);
  }
  if (req.upscaleHeight && req.upscaleHeight > 0) vf.push(`scale=-2:${req.upscaleHeight}:flags=lanczos`);
  vf.push("format=yuv420p");

  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgba",
    "-video_size",
    `${req.width}x${req.height}`,
    "-framerate",
    String(req.sourceFps),
    "-i",
    "pipe:0",
  ];
  if (req.audioPath) args.push("-i", req.audioPath);
  args.push("-vf", vf.join(","), "-r", String(req.outputFps));
  args.push(...encoderArgs(req.encoder, req.crf));
  if (req.audioPath) {
    if (req.audioTempo && Math.abs(req.audioTempo - 1) > 1e-6) args.push("-filter:a", tempoChain(req.audioTempo));
    args.push("-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest");
  }
  args.push(req.output);

  exportStderr = "";
  const proc = spawn(ffmpegPath(), args, { windowsHide: true });
  exportProc = proc;
  proc.stderr.on("data", (d) => (exportStderr += d.toString()));
  proc.stdin.on("error", () => undefined); // EPIPE if ffmpeg dies early; surfaced on finish
  proc.on("close", () => (exportProc = proc === exportProc ? null : exportProc));
}

/** Fallback path: write a single frame straight to ffmpeg's stdin via normal IPC. */
export async function videoExportFrame(frame: Buffer): Promise<void> {
  const proc = exportProc;
  if (!proc || !proc.stdin.writable) throw exportError(proc?.exitCode ?? null);
  if (!proc.stdin.write(frame)) await once(proc.stdin, "drain");
}

export async function videoExportFinish(): Promise<void> {
  // Flush any frames still queued from the port before closing ffmpeg's stdin.
  while (frameQueue.length > 0 || draining) await new Promise((r) => setTimeout(r, 5));
  const proc = exportProc;
  if (!proc) throw new Error("No video export running");
  await new Promise<void>((resolve, reject) => {
    proc.on("close", (code) => {
      exportProc = null;
      detachFramePort();
      if (code === 0) resolve();
      else reject(exportError(code));
    });
    proc.stdin.end();
  });
}

export function videoExportCancel(): void {
  detachFramePort();
  if (exportProc) {
    try {
      exportProc.kill();
    } catch {
      /* already gone */
    }
    exportProc = null;
  }
}

export function setupSpeedAudioListeners() {
  ipcMain.handle("speedChangeAudio", (event, request: SpeedAudioRequest) => createSpeedAudio(request));
  ipcMain.handle("trimAudio", (event, request: TrimAudioRequest) => createTrimmedAudio(request));
  ipcMain.handle("compileMashup", (event, request: CompileMashupRequest) =>
    createMashup(request, (p) => event.sender.send("mashupProgress", p)),
  );
  ipcMain.handle("convertToMp4", (event, request: ConvertToMp4Request) => convertToMp4(request));
  ipcMain.handle("detectVideoEncoder", () => detectH264Encoder());
  ipcMain.handle("assembleVideo", (event, request: AssembleVideoRequest) => assembleVideo(request));
  ipcMain.handle("videoExportStart", (event, request: VideoStreamStartRequest) => videoExportStart(request));
  ipcMain.on("videoExportSetupPort", (event) => {
    const port = event.ports[0];
    if (port) attachFramePort(port);
  });
  ipcMain.handle("videoExportFrame", (event, frame: Buffer) => videoExportFrame(frame));
  ipcMain.handle("videoExportFinish", () => videoExportFinish());
  ipcMain.handle("videoExportCancel", () => videoExportCancel());
}
