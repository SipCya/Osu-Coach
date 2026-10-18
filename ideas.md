# osu!coach — ideas & TODO


remove claude code in the repository. no tracks of claude code in the pushes. we will put  the ai disclosure in the readme evenutally

export as mp4:

~~cursor dimension is missing in the settings.~~ — ✅ already there (the "Cursor size" slider, 10–200%).
check for anything that could be missing.

TODO:
~~test each overlay~~ — ✅ checked, all overlays look fine.

## ✅ Done (recent)

- **Song Mashup** tab (mp3 mashup only — the map-merge idea was dropped): browse the osu! library (searchable), pick parts of songs on a **waveform** (scrub + preview volume + **preview at the chosen speed**), per-segment **speed** and **fade in/out**, per-join **gap or crossfade**, optional **loudness-match** (EBU R128) across songs, single-pass ffmpeg engine; live total length + render progress and ETA.
- **Tab state persistence**: switching tabs no longer resets a screen. Tool tabs are kept mounted (keep-alive, clock paused on switch); Map Practice uses `usePersistentState` (it shares the Analyzer's PIXI renderer so it can't be kept alive).
- **UR analyzer** (second tab in the coach/Mistakes panel, not a popup): UR, average error, **suggested offset** (= mean, osu! sign), 300/100/50/miss counts, a hit-error scatter and a **rolling UR-over-time line chart** (Y-axis values, min/max markers, hover readout, **adjustable rolling window** 15/30/50/100); clicking a point jumps. In Mistakes, **100/50 are checkboxes** next to the Aim/Tapping/Other filters, plus a **Group by type** toggle.
- **Continuous export sounds**: the exported video's audio now mixes **slider slides** (`sliderslide`/`sliderwhistle`, while the head was hit) and **spinner spins** (`spinnerspin`), looped for each object's duration, on top of the hit samples.
- **Export ETA**: estimated time remaining shown while rendering; the mashup shows a progress bar + ETA too. (Encoder + elapsed/fps were already shown.)
- **HUD mod icons**: doubled in size and moved below the accuracy counter (were tiny and cramped).
- **Map Practice** tab (same song): build a map from sections at any point, merge sections from different difficulties, editor-style preview (play/pause/seek + music + volume), optional audio trsim to the practiced part.
- **Replay Reviewer audio**: effect-sound volume slider fixed; hitsounds now come from the **chosen skin** by default, with a toggle "use beatmap hitsounds".
- **Cheat check v1** (in the Reviewer): timewarp (frametime histogram), cursor snaps, unstable rate, pairwise replay similarity. Snap timings are now in m:ss.cs and **clickable to jump** to that point in the replay.
- **Video export (osr → mp4)**, offline frame-by-frame via **raw-pipe** (raw RGBA streamed to ffmpeg, no PNGs): FPS up to 960, 720p/1080p, upscale 1440p/4K (lanczos), **motion blur** (×2/×4/×8/×16 blend), GPU encoder auto (nvenc/amf/qsv → libx264), clean osu! look vs osu!coach data, "start at first object" (default on), background dim baked correctly (black backdrop), audio = song + hitsounds (offline mixdown).
- **Cheat report web page**: "Open complete report" → self-contained interactive HTML (opens in browser) with frametime histogram, hit-error distribution, **key-hold duration per circle** (fine bins like osu! holdtime), snaps table (m:ss.cs), stat tiles; charts have hover tooltips (value + range), X/Y axes with gridlines, and a mean line.
- **HUD overlays** (optional, shown live AND in the MP4): key-presses, **unstable rate**, **mods** (acronyms). Toggles in Settings → Game → Overlays, and independently in the export dialog. (PP counter was removed — the bundled pp algorithm was too unreliable.)
- **Export fully independent from the Reviewer**: the export dialog carries ALL visual options (dim, blur, cursor on/off + size, trail, hit-error-bar on/off + scale, playfield border, analysis cursor, overlays, apply replay mods HD/FL, etc.); it snapshots → applies → restores the live settings, so exporting never changes the Reviewer.
- **Fixes**: Settings modal no longer re-opens on Space during a replay (focus bug); mouse wheel seeks ~5 frames per notch when paused (arrows still 1 frame).
- **Cheat flags + verdict**: automatic suspicion flags (timewarp, low UR, uniform key-holds, cursor snaps, impossible cursor speed) with severity, shown in the dialog and the HTML report (suspicious bars highlighted red), plus an overall verdict (Likely legit / Worth reviewing / Suspicious).
- **Mod icons overlay**: real mod icons loaded from the chosen skin's `selection-mod-*` files (fallback to bundled YUGEN). **Left menu**: removed the duplicate Analyzer entry.

## 🎬 Video export

- ✅ **Pause & resume (same session)**: the render loop can be paused/resumed and cancelled from the export dialog (ffmpeg stays alive while paused). **Resume after closing the app is still TODO** — the raw-pipe produces a single streamed mp4, so it needs a **segmented rewrite**: render in chunks (each a complete mp4), persist a small state file (options, replay, done chunks), continue the missing chunks on relaunch, then concat + mux audio.
- ✅ **MessagePort** frame transport: frames are transferred to main over a dedicated port with a credit window (no per-frame IPC round-trip).
- Storyboard samples (one-shot audio samples triggered by the storyboard).
- ✅ Export now plays at the replay speed (DT/HT, video + audio); ✅ "Trim outro" option; ✅ continuous slider/spinner sounds in the mixdown.

## 🗺️ Map Practice

- Merge across **different songs** (needs audio splicing) — see Song Mashup (done, mp3-only).

## 🎵 Song Mashup

- ✅ Done (mp3 mashup), incl. loudness-match option + per-segment preview at the chosen speed. Possible further polish: per-segment gain trim, beat-synced crossfades.

## 🔍 Cheat check

*(The interactive HTML report already exists — see Done. Remaining:)*

- **Reliable:** improve the timewarp metric (% of impossibly-fast frames, detect a constant-frametime cluster); replay-steal with time alignment (cross-correlation) + a calibrated threshold.
- **Heuristic (with disclaimers):** relax (auto-tap), autopilot (auto-aim), aim correction / assist.
- **Frame anomalies:** perfectly straight aim segments (impossible cursor speed already shown as a stat).
- Report polish: cursor snaps as a **timeline** (angle vs time), a cursor-speed-over-time chart. Also: **PDF export** of the report? Tune the flag thresholds on real replays.
- Big / optional: **osu! API** (OAuth) for leaderboard comparison / reference replays.

## 🎯 Aim trainer

- Train on the player's **real mistakes**: the Reviewer already knows where you fail (overshoot/undershoot on jumps, angles, distances, rhythms). Generate exercises with the same jump distances, angles and BPM from your replays, repeated until consistent, then re-checked on new replays to see if the mistakes went down.
- **Maybe instead**, build this inside the Reviewer via the Map Practice feature: let the user create maps from the sections where they make the most mistakes — and keep the aim trainer itself as it is.

## 🧠 Coaching system

- After a few analyzed replays: suggestions on what to improve and the player's main aim/tapping issues (later, maybe with map suggestions). Requires tracking the replay-analysis results over time.

## 🖥️ UI / bugs

- Left menu: duplicate Analyzer removed. Still optional: split **osu coaching** (Analyzer / Trainer / Speed Changer / Skins) on the left, **osu tools** (the rest) on the top menu (bigger nav redesign — discuss first).
- General UI pass (later).

- Add export cancel (✅ done) — pause/resume same-session (✅ done); resume-after-close still TODO (see Video export).

## 🧪 Hard / future

- **PP calculator** — would require building tosu into the project; otherwise redundant since tosu itself already has many overlays.

## Dev

```
yarn.cmd run desktop-frontend:dev
yarn.cmd run desktop-main:dev
```
