# osu!coach — ideas & TODO

## ✅ Done (recent)

- **Map Practice** tab (same song): build a map from sections at any point, merge sections from different difficulties, editor-style preview (play/pause/seek + music + volume), optional audio trim to the practiced part.
- **Replay Reviewer audio**: effect-sound volume slider fixed; hitsounds now come from the **chosen skin** by default, with a toggle "use beatmap hitsounds".
- **Cheat check v1** (in the Reviewer): timewarp (frametime histogram), cursor snaps, unstable rate, pairwise replay similarity. Snap timings are now in m:ss.cs and **clickable to jump** to that point in the replay.
- **Video export (osr → mp4)**, offline frame-by-frame via **raw-pipe** (raw RGBA streamed to ffmpeg, no PNGs): FPS up to 960, 720p/1080p, upscale 1440p/4K (lanczos), **motion blur** (×2/×4/×8/×16 blend), GPU encoder auto (nvenc/amf/qsv → libx264), clean osu! look vs osu!coach data, "start at first object" (default on), background dim baked correctly (black backdrop), audio = song + hitsounds (offline mixdown).
- **Cheat report web page**: "Open complete report" → self-contained interactive HTML (opens in browser) with frametime histogram, hit-error distribution, **key-hold duration per circle** (fine bins like osu! holdtime), snaps table (m:ss.cs), stat tiles; charts have hover tooltips (value + range), X/Y axes with gridlines, and a mean line.
- **HUD overlays** (optional, shown live AND in the MP4): key-presses, **unstable rate**, **PP counter** (running; approximate — based on the bundled `@osujs/pp`). Toggles in Settings → Game → Overlays.
- **Fixes**: Settings modal no longer re-opens on Space during a replay (focus bug); mouse wheel seeks ~5 frames per notch when paused (arrows still 1 frame).

## 🎬 Video export

- **Pause & resume the export** — feasible: rendering is deterministic, so stop at frame N and resume from N+1. Same-session is easy; resuming after closing the app needs a small persisted state file (options, next frame, replay). (Note: now streaming via raw-pipe, so "resume" means re-run ffmpeg from scratch or re-encode — revisit the approach.)
- Show the **encoder used** (NVENC/AMF/QSV/CPU) and elapsed time / fps in the dialog.
- **MessagePort** instead of per-frame IPC for faster frame streaming.
- Continuous sounds (slider slide, spinner spin), storyboard samples, DT/HT audio tempo. Also: trim the outro after the last object.

## 🗺️ Map Practice

- Merge across **different songs** (needs audio splicing) — see Songs compilation.

## 🎵 Songs compilation

- Merge chosen songs into one, with default checkboxes: keep the same BPM timings / only mp3 audio.

## 🔍 Cheat check

*(The interactive HTML report already exists — see Done. Remaining:)*

- **Reliable:** improve the timewarp metric (% of impossibly-fast frames, detect a constant-frametime cluster); replay-steal with time alignment (cross-correlation) + a calibrated threshold.
- **Heuristic (with disclaimers):** relax (auto-tap), autopilot (auto-aim), aim correction / assist.
- **Frame anomalies:** perfectly straight aim segments (impossible cursor speed already shown as a stat).
- Combined **"suspicion score"** report (each check + confidence; always "hints, not proof").
- Report polish: cursor snaps as a **timeline** (angle vs time), a cursor-speed-over-time chart, and a **suspicion summary** section. Also: **PDF export** of the report?
- Big / optional: **osu! API** (OAuth) for leaderboard comparison / reference replays.

## 🎯 Aim trainer

- Train on the player's **real mistakes**: the Reviewer already knows where you fail (overshoot/undershoot on jumps, angles, distances, rhythms). Generate exercises with the same jump distances, angles and BPM from your replays, repeated until consistent, then re-checked on new replays to see if the mistakes went down.
- **Maybe instead**, build this inside the Reviewer via the Map Practice feature: let the user create maps from the sections where they make the most mistakes — and keep the aim trainer itself as it is.

## 🧠 Coaching system

- After a few analyzed replays: suggestions on what to improve and the player's main aim/tapping issues (later, maybe with map suggestions). Requires tracking the replay-analysis results over time.

## 🖥️ UI / bugs

- Left menu: remove the duplicate Analyzer entry. Maybe split: **osu coaching** (Analyzer / Trainer / Speed Changer / Skins) on the left, **osu tools** (the rest) on the top menu.
- General UI pass (later).


## 🧪 Hard / future

- **PP calculator** — would require building tosu into the project; otherwise redundant since tosu itself already has many overlays.

## Dev

```
yarn.cmd run desktop-frontend:dev
yarn.cmd run desktop-main:dev
```
