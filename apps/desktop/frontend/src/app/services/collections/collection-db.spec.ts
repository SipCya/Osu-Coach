import { readCollectionDb, writeCollectionDb } from "./collection-db";

const MD5_A = "0123456789abcdef0123456789abcdef";
const MD5_B = "fedcba9876543210fedcba9876543210";

function handMadeDb() {
  const parts: number[] = [];
  const int32 = (v: number) => {
    const b = Buffer.alloc(4);
    b.writeInt32LE(v, 0);
    parts.push(...b);
  };
  const str = (s: string) => {
    const bytes = Buffer.from(s, "utf8");
    parts.push(0x0b, bytes.length, ...bytes);
  };
  int32(20210528);
  int32(1);
  str("Farm");
  int32(2);
  str(MD5_A);
  str(MD5_B);
  return Buffer.from(parts);
}

describe("collection.db", () => {
  it("reads a file written like osu! does", () => {
    const db = readCollectionDb(handMadeDb());
    expect(db.version).toBe(20210528);
    expect(db.collections).toHaveLength(1);
    expect(db.collections[0].name).toBe("Farm");
    expect(db.collections[0].mapIds).toEqual([MD5_A, MD5_B]);
  });

  it("writes exactly the same bytes osu! would write", () => {
    const db = readCollectionDb(handMadeDb());
    expect(writeCollectionDb(db).equals(handMadeDb())).toBe(true);
  });

  it("round-trips empty collections, unicode and long names", () => {
    const longName = "x".repeat(300);
    const written = writeCollectionDb({
      version: 20150203,
      collections: [
        { id: "1", name: "Empty", mapIds: [] },
        { id: "2", name: "ストリーム 🎵", mapIds: [MD5_A] },
        { id: "3", name: longName, mapIds: [MD5_B, MD5_A] },
      ],
    });
    const read = readCollectionDb(written);
    expect(read.version).toBe(20150203);
    expect(read.collections.map((c) => [c.name, c.mapIds])).toEqual([
      ["Empty", []],
      ["ストリーム 🎵", [MD5_A]],
      [longName, [MD5_B, MD5_A]],
    ]);
  });

  it("rejects a truncated file instead of losing collections", () => {
    const data = handMadeDb();
    expect(() => readCollectionDb(data.subarray(0, data.length - 5))).toThrow();
  });
});
