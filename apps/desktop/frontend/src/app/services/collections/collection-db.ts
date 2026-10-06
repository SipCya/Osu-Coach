import { createCollection, OsuCollection } from "../../utils/collection-manager";

export const DEFAULT_COLLECTION_DB_VERSION = 20150203;

export interface CollectionDb {
  version: number;
  collections: OsuCollection[];
}

class Cursor {
  private position = 0;

  constructor(private readonly buffer: Buffer) {}

  private need(bytes: number) {
    if (this.position + bytes > this.buffer.length) throw new Error("collection.db is truncated or corrupted");
  }

  int32() {
    this.need(4);
    const value = this.buffer.readInt32LE(this.position);
    this.position += 4;
    return value;
  }

  private uleb128() {
    let result = 0;
    let shift = 0;
    for (;;) {
      this.need(1);
      const byte = this.buffer[this.position++];
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
    }
  }

  string() {
    this.need(1);
    const marker = this.buffer[this.position++];
    if (marker === 0x00) return "";
    if (marker !== 0x0b) throw new Error("collection.db is corrupted (bad string marker)");
    const length = this.uleb128();
    this.need(length);
    const value = this.buffer.toString("utf8", this.position, this.position + length);
    this.position += length;
    return value;
  }
}

export function readCollectionDb(buffer: Buffer): CollectionDb {
  const cursor = new Cursor(buffer);
  const version = cursor.int32();
  const count = cursor.int32();
  const collections: OsuCollection[] = [];
  for (let i = 0; i < count; i++) {
    const name = cursor.string();
    const mapCount = cursor.int32();
    const mapIds: string[] = [];
    for (let j = 0; j < mapCount; j++) mapIds.push(cursor.string());
    collections.push(createCollection(name, mapIds));
  }
  return { version, collections };
}

function int32(value: number) {
  const b = Buffer.alloc(4);
  b.writeInt32LE(value, 0);
  return b;
}

function osuString(value: string) {
  if (value.length === 0) return Buffer.from([0x00]);
  const bytes = Buffer.from(value, "utf8");
  const header = [0x0b];
  let length = bytes.length;
  do {
    let byte = length & 0x7f;
    length = Math.floor(length / 128);
    if (length > 0) byte |= 0x80;
    header.push(byte);
  } while (length > 0);
  return Buffer.concat([Buffer.from(header), bytes]);
}

export function writeCollectionDb({ version, collections }: CollectionDb): Buffer {
  const chunks: Buffer[] = [int32(version), int32(collections.length)];
  for (const c of collections) {
    chunks.push(osuString(c.name), int32(c.mapIds.length));
    for (const md5 of c.mapIds) chunks.push(osuString(md5));
  }
  return Buffer.concat(chunks);
}
