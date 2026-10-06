# osu!coach

Desktop tools for [osu!](https://osu.ppy.sh/) stable:

- **Replay Reviewer**: watch your replays and see every mistake explained
- **Speed Changer**: create faster or slower versions of a map
- **Collections**: manage your in-game collections
- **Cleaner**: free disk space and manage local scores, replays and backups
- **Aim Trainer**: circles and sliders, with adjustable size, speed, distance and BPM
- **Skins**: mix elements between skins, recolor them, generate random skins

## Development

```
yarn install
yarn run desktop-frontend:dev
yarn run desktop-main:dev
```

## Build

```
yarn run build
```

The installer is created in `dist/electron`.
