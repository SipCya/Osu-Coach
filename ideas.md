# osu!coach — ideas & TODO

> Only open items are kept here. Completed work lives in the git history.

- No "claude code" tracks in the repo / pushes; add the AI disclosure to the README eventually.

## 🎬 Video export

- **Resume after closing the app** — the raw-pipe produces a single streamed mp4, so it needs a **segmented rewrite**: render in chunks (each a complete mp4), persist a small state file (options, replay, done chunks), continue the missing chunks on relaunch, then concat + mux audio.
- **MessagePort frame transport** — tried and reverted (it regressed the export and couldn't be verified reliably). Revisit with a safer implementation if the speed is needed. (Dormant port code still sits in `speed-audio.ts`.)

## 🔍 Cheat check

- **Reliable:** improve the timewarp metric (% of impossibly-fast frames, detect a constant-frametime cluster); replay-steal with time alignment (cross-correlation) + a calibrated threshold.
- **Heuristic (with disclaimers):** relax (auto-tap), autopilot (auto-aim), aim correction / assist.
- **Frame anomalies:** perfectly straight aim segments.
- **Report:** PDF export; tune the flag thresholds on real replays.
- **Big / optional:** osu! API (OAuth) for leaderboard comparison / reference replays.

## 🧠 Coaching system

- Later: map suggestions and a per-skill breakdown over time (the Progress panel already tracks a per-player history).

## 🖥️ UI

- Nav redesign: split **osu coaching** (Analyzer / Trainer / Speed Changer / Skins) on the left vs **osu tools** (the rest) on the top menu — discuss first.
- General UI pass.

## 🧪 Hard / future

- **PP calculator** — would require building tosu into the project; otherwise redundant since tosu already has many overlays.

## Dev

```
yarn.cmd run desktop-frontend:dev
yarn.cmd run desktop-main:dev
```
