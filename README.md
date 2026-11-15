# osu!coach

Desktop tools for [osu!](https://osu.ppy.sh/) stable on Windows.

## Features

| Tab | What it does |
|---|---|
| **Replay Reviewer** | Watch your replays and see every mistake explained (early/late clicks, aim, notelock, slider breaks). Includes a **UR analyzer** (unstable rate, suggested offset, hit-error and UR-over-time charts), a **Progress** panel that tracks your plays over time and highlights your main weaknesses, a **Cheat check** with an interactive report, and **MP4 export** of any replay (DT/HT speed, motion blur, overlays, song + hitsounds). |
| **Map Practice** | Build a practice map from the sections you want, even merging sections across different difficulties of the same song. Editor-style preview with music and volume, optional audio trim to the practiced part. |
| **Song Mashup** | Stitch parts of songs from your osu! library into a single MP3: pick parts on a waveform, per-segment speed / volume / fades, and joins as a gap or a beat-synced crossfade. |
| **Speed Changer** | Create faster or slower versions of a map, by multiplier or exact BPM, with optional pitch change and custom AR/CS/OD/HP. Save settings as profiles and reuse them on any map. |
| **Collections** | Manage the collections you see in game: create, rename, delete, add and remove maps, search and filter your maps. |
| **Cleaner** | Free disk space (videos, storyboards, skin elements, hitsounds, backgrounds, difficulties of a mode, leftover files), replace missing backgrounds, manage local replays and local scores, move the Songs folder to another drive, restore osu!coach backups. |
| **Aim Trainer** | Circles and sliders with adjustable size, approach rate, jump distance, BPM and keys. Shows where your clicks land compared to the jump direction. |
| **Skins** | Replace element groups between skins, recolor images, generate a random skin mixing the ones you have. Every change can be restored. |
| **Flashlight** | Practice the Flashlight mod without using it: an overlay over osu! that darkens everything except around the cursor, or an FL cursor generated for the skin you use. |

## tosu

Some features read live data from the game through [tosu](https://github.com/tosuapp/tosu) (gosumemory works too, it uses the same API). Everything else works without it.

| Feature | With tosu | Without tosu |
|---|---|---|
| Speed Changer: **Follow the map selected in osu!** | The map you select in song select is loaded automatically. | Choose the `.osu` file by hand. |
| Flashlight overlay: **Shrink at 100 and 200 combo** | The circle shrinks with your combo. | Not available: the circle keeps its full size. |
| Flashlight overlay: **Darken only while playing a map** | Uses the game state from tosu. | Still works: osu!coach reads the title of the osu! window, which changes while you play a map. |

Start tosu before or together with osu!. osu!coach finds it by itself on the default address (`127.0.0.1:24050`).

## Good to know

- **Collections** and **local scores** can only be saved with osu! closed: osu! rewrites those files when it closes and would undo the changes. osu!coach checks it and stops you if osu! is open.
- Before changing `collection.db` or `scores.db`, osu!coach saves a copy in `osu!/osucoach-backups` (the last 10 of each). You can restore them from the Cleaner tab.
- Skin changes keep the original files in a `.osucoach-originals` folder inside the skin. In osu!, reload the skin with `Ctrl+Alt+Shift+S` to see the changes.
- The Flashlight overlay needs osu! in borderless or windowed mode: nothing can be drawn over exclusive fullscreen. The FL cursor works in any mode.

The Replay Reviewer's cheat check is a set of **heuristic hints, not proof** — always review a replay yourself before drawing any conclusion.

## AI disclosure

osu!coach was built with heavy use of AI assistance (Anthropic's Claude) for writing and reviewing code. All features were directed, tested and are maintained by the author.

## Development

```
yarn install
yarn run desktop-frontend:dev
yarn run desktop-main:dev
```

Start the second command when the first one says it compiled. In PowerShell, use `yarn.cmd` if running scripts is disabled.

## Build

```
yarn run desktop:build:prod
```

Builds the renderer and main process for production and packages a Windows installer in `dist/electron`.
