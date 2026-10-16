import { useCallback, useEffect, useRef, useState } from "react";
import { Box, CircularProgress, IconButton, Slider, Typography } from "@mui/material";
import { PauseCircle, PlayCircle, VolumeOff, VolumeUp } from "@mui/icons-material";
import { readFile } from "fs/promises";
import { pathToFileURL } from "url";
import { formatTime } from "../../services/map-practice/osu-practice";

const ACCENT = "#ff66aa";
const HEIGHT = 96;

/** Downsampled min/max envelope used to paint the waveform. */
interface Peaks {
  mins: Float32Array;
  maxs: Float32Array;
  durationMs: number;
}

// Preview volume is shared across all segment players and remembered for next time.
const VOLUME_KEY = "osucoach-mashup-volume";
function initialVolume(): number {
  try {
    const v = Number(window.localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
  } catch {
    return 1;
  }
}

// One shared context: browsers cap the number of AudioContexts, and decoding is all we need it for.
let sharedCtx: AudioContext | null = null;
function audioContext(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  return sharedCtx;
}

async function decodePeaks(path: string, buckets: number): Promise<Peaks> {
  const data = await readFile(path);
  const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const audio = await audioContext().decodeAudioData(copy as ArrayBuffer);
  const channel = audio.getChannelData(0);
  const mins = new Float32Array(buckets);
  const maxs = new Float32Array(buckets);
  const step = channel.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * step);
    const to = Math.min(channel.length, Math.floor((b + 1) * step));
    let lo = 0;
    let hi = 0;
    for (let i = from; i < to; i++) {
      const v = channel[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    mins[b] = lo;
    maxs[b] = hi;
  }
  return { mins, maxs, durationMs: audio.duration * 1000 };
}

export interface WaveformSelectorProps {
  src: string;
  startMs: number;
  endMs: number;
  onChange: (startMs: number, endMs: number) => void;
  onDuration?: (durationMs: number) => void;
}

/** Waveform with draggable start/end handles and preview playback of the selected region. */
export function WaveformSelector({ src, startMs, endMs, onChange, onDuration }: WaveformSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(600);
  const [playing, setPlaying] = useState(false);
  const [playheadMs, setPlayheadMs] = useState<number | null>(null);
  const [volume, setVolume] = useState(initialVolume);
  const drag = useRef<"start" | "end" | "seek" | null>(null);

  const durationMs = peaks?.durationMs ?? Math.max(endMs, 1);

  // Track the available width so the canvas is crisp and the peaks match the pixels.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.max(200, Math.floor(entries[0].contentRect.width))));
    ro.observe(el);
    setWidth(Math.max(200, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    setError(null);
    decodePeaks(src, Math.max(200, width))
      .then((p) => {
        if (cancelled) return;
        setPeaks(p);
        onDuration?.(p.durationMs);
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
    // Re-decode when the file changes; a width change only rescales the existing render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Apply and remember the preview volume.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    try {
      window.localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      /* ignore unavailable storage */
    }
  }, [volume]);

  const msToX = useCallback((ms: number) => (durationMs > 0 ? (ms / durationMs) * width : 0), [durationMs, width]);
  const xToMs = useCallback(
    (x: number) => Math.max(0, Math.min(durationMs, (x / Math.max(1, width)) * durationMs)),
    [durationMs, width],
  );

  // Paint the waveform, the selected region and the handles / playhead.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);

    const mid = HEIGHT / 2;
    const n = peaks.maxs.length;
    const sx = msToX(startMs);
    const ex = msToX(endMs);

    for (let i = 0; i < n; i++) {
      const x = (i / n) * width;
      const inside = x >= sx && x <= ex;
      ctx.fillStyle = inside ? ACCENT : "rgba(255,255,255,0.22)";
      const top = mid - peaks.maxs[i] * (mid - 2);
      const bot = mid - peaks.mins[i] * (mid - 2);
      ctx.fillRect(x, top, Math.max(1, width / n), Math.max(1, bot - top));
    }

    // Dim the area outside the selection.
    ctx.fillStyle = "rgba(10,10,14,0.55)";
    ctx.fillRect(0, 0, sx, HEIGHT);
    ctx.fillRect(ex, 0, width - ex, HEIGHT);

    // Handles.
    ctx.fillStyle = ACCENT;
    ctx.fillRect(sx - 1, 0, 2, HEIGHT);
    ctx.fillRect(ex - 1, 0, 2, HEIGHT);
    ctx.beginPath();
    ctx.arc(sx, 8, 5, 0, Math.PI * 2);
    ctx.arc(ex, HEIGHT - 8, 5, 0, Math.PI * 2);
    ctx.fill();

    // Playhead.
    if (playheadMs != null) {
      const px = msToX(playheadMs);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px - 0.5, 0, 1, HEIGHT);
    }
  }, [peaks, width, startMs, endMs, playheadMs, msToX]);

  const pointerMs = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return xToMs(e.clientX - (rect?.left ?? 0));
  };

  const HANDLE_PX = 10;
  const onPointerDown = (e: React.PointerEvent) => {
    if (!peaks) return;
    const ms = pointerMs(e);
    const px = msToX(ms);
    const nearStart = Math.abs(px - msToX(startMs));
    const nearEnd = Math.abs(px - msToX(endMs));
    // Near a selection edge → drag that handle; anywhere else → scrub the playhead.
    if (nearStart <= HANDLE_PX && nearStart <= nearEnd) drag.current = "start";
    else if (nearEnd <= HANDLE_PX) drag.current = "end";
    else drag.current = "seek";
    canvasRef.current?.setPointerCapture(e.pointerId);
    applyDrag(ms);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    applyDrag(pointerMs(e));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  };
  const applyDrag = (ms: number) => {
    const snapped = Math.round(ms);
    if (drag.current === "start") onChange(Math.min(snapped, endMs - 200), endMs);
    else if (drag.current === "end") onChange(startMs, Math.max(snapped, startMs + 200));
    else if (drag.current === "seek") seekTo(snapped);
  };

  const seekTo = (ms: number) => {
    const clamped = Math.max(0, Math.min(durationMs, ms));
    setPlayheadMs(clamped);
    if (audioRef.current) audioRef.current.currentTime = clamped / 1000;
  };

  // Preview playback: play from the selection start, stop at its end.
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    // Resume from the playhead; if there is none (or it's at the very end), start at the selection.
    const from = playheadMs != null && playheadMs < durationMs - 50 ? playheadMs : startMs;
    audio.currentTime = from / 1000;
    void audio.play();
  };
  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio) setPlayheadMs(audio.currentTime * 1000);
  };

  return (
    <Box ref={wrapRef} sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton size={"small"} onClick={togglePlay} disabled={!peaks} sx={{ color: ACCENT }}>
          {playing ? <PauseCircle /> : <PlayCircle />}
        </IconButton>
        <Typography variant={"caption"} sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
          {formatTime(startMs)} – {formatTime(endMs)} / {formatTime(durationMs)}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: "auto", width: 140 }}>
          <IconButton
            size={"small"}
            onClick={() => setVolume((v) => (v > 0 ? 0 : 1))}
            sx={{ color: "text.secondary" }}
          >
            {volume === 0 ? <VolumeOff fontSize={"small"} /> : <VolumeUp fontSize={"small"} />}
          </IconButton>
          <Slider
            size={"small"}
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(_, v) => setVolume(v as number)}
            sx={{ color: ACCENT }}
          />
        </Box>
      </Box>
      <Box
        sx={{
          position: "relative",
          height: HEIGHT,
          mt: 0.5,
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: "rgba(0,0,0,0.25)",
        }}
      >
        {!peaks && !error && (
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <CircularProgress size={22} sx={{ color: ACCENT }} />
          </Box>
        )}
        {error && (
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", px: 2 }}>
            <Typography variant={"caption"} color={"error"}>
              {error}
            </Typography>
          </Box>
        )}
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: HEIGHT, display: "block", cursor: "ew-resize", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </Box>
      <audio
        ref={audioRef}
        src={pathToFileURL(src).href}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        preload={"none"}
      />
    </Box>
  );
}
