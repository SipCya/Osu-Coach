import { readScoresDb, scoresByPlayer, writeScoresDb } from "./scores-db";

function str(s: string) {
  const bytes = Buffer.from(s, "utf8");
  return Buffer.concat([Buffer.from([0x0b, bytes.length]), bytes]);
}

function score(beatmap: string, player: string, replay: string, mods = 0) {
  const parts = [
    Buffer.from([0]),
    Buffer.alloc(4),
    str(beatmap),
    str(player),
    str(replay),
    Buffer.alloc(2 * 6 + 4 + 2 + 1),
  ];
  const modsBuf = Buffer.alloc(4);
  modsBuf.writeInt32LE(mods, 0);
  parts.push(modsBuf, Buffer.from([0x00]), Buffer.alloc(8), Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.alloc(8));
  if (mods & (1 << 23)) parts.push(Buffer.alloc(8, 7));
  return Buffer.concat(parts);
}

function int32(v: number) {
  const b = Buffer.alloc(4);
  b.writeInt32LE(v, 0);
  return b;
}

function handMadeDb() {
  return Buffer.concat([
    int32(20230101),
    int32(2),
    str("map1"),
    int32(2),
    score("map1", "Alice", "r1"),
    score("map1", "Bob", "r2", 1 << 23),
    str("map2"),
    int32(1),
    score("map2", "Bob", "r3"),
  ]);
}

describe("scores.db", () => {
  it("rewrites the file byte for byte when nothing is removed", () => {
    const data = handMadeDb();
    expect(writeScoresDb(readScoresDb(data)).equals(data)).toBe(true);
  });

  it("counts scores per player", () => {
    expect(scoresByPlayer(readScoresDb(handMadeDb()))).toEqual([
      { player: "Bob", count: 2 },
      { player: "Alice", count: 1 },
    ]);
  });

  it("removes every score of a player and keeps maps left with 0 scores (like osu! does)", () => {
    const db = readScoresDb(writeScoresDb(readScoresDb(handMadeDb()), (s) => s.player !== "Bob"));
    expect(db.version).toBe(20230101);
    expect(db.beatmaps.map((b) => [b.md5, b.scores.map((s) => s.player)])).toEqual([
      ["map1", ["Alice"]],
      ["map2", []],
    ]);
  });

  it("refuses files it does not fully understand", () => {
    expect(() => readScoresDb(Buffer.concat([handMadeDb(), Buffer.from([1])]))).toThrow();
    expect(() => readScoresDb(handMadeDb().subarray(0, 40))).toThrow();
  });
});
