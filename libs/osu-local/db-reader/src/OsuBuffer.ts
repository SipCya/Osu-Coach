/**
 MIT License

 Copyright (c) 2017 Dillon Modine-Thuen

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.

 */

export class OsuBuffer {
  buffer: Buffer;
  position: number;

  constructor(input?: Buffer) {
    this.buffer = Buffer.from(input instanceof Buffer ? input : []);
    this.position = 0;
  }

  get length() {
    return this.buffer.length;
  }

  toString(type: "binary" | "ascii" = "binary") {
    return this.buffer.toString(type);
  }

  static from(args: any) {
    if (args[0] instanceof OsuBuffer) {
      args[0] = args[0].buffer;
    }
    return new OsuBuffer(Buffer.from.apply(Buffer, args));
  }

  canRead(length: number) {
    return length + this.position <= this.buffer.length;
  }

  isEOF() {
    return this.position >= this.buffer.length;
  }

  slice(length: number, asOsuBuffer = true) {
    this.position += length;
    return asOsuBuffer
      ? OsuBuffer.from(this.buffer.slice(this.position - length, this.position))
      : this.buffer.slice(this.position - length, this.position);
  }

  peek() {
    return this.buffer[this.position + 1];
  }

  readByte() {
    return this.readUInt8();
  }

  readInt(byteLength: number) {
    this.position += byteLength;
    return this.buffer.readIntLE(this.position - byteLength, byteLength);
  }

  readUInt(byteLength: number) {
    this.position += byteLength;
    return this.buffer.readUIntLE(this.position - byteLength, byteLength);
  }

  readInt8() {
    return this.readInt(1);
  }

  readUInt8() {
    return this.readUInt(1);
  }

  readInt16() {
    return this.readInt(2);
  }

  readUInt16() {
    return this.readUInt(2);
  }

  readInt32() {
    return this.readInt(4);
  }

  readUInt32() {
    return this.readUInt(4);
  }

  readInt64(): BigInt {
    this.position += 8;
    return this.buffer.readBigInt64LE(this.position - 8);
  }

  readUInt64() {
    this.position += 8;
    return this.buffer.readBigUInt64LE(this.position - 8);
  }

  readFloat() {
    this.position += 4;
    return this.buffer.readFloatLE(this.position - 4);
  }

  readDouble() {
    this.position += 8;
    return this.buffer.readDoubleLE(this.position - 8);
  }

  readString(length: number) {
    return this.slice(length, false).toString();
  }

  readVarInt() {
    let total = 0;
    let shift = 0;
    let byte = this.readUInt8();
    if ((byte & 0x80) === 0) {
      total |= (byte & 0x7f) << shift;
    } else {
      let end = false;
      do {
        if (shift) {
          byte = this.readUInt8();
        }
        total |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) end = true;
        shift += 7;
      } while (!end);
    }

    return total;
  }

  readULeb128() {
    return this.readVarInt();
  }

  readBoolean() {
    return Boolean(this.readInt(1));
  }

  readOsuString() {
    const isString = this.readByte() === 11;
    if (isString) {
      const len = this.readVarInt();
      return this.readString(len);
    } else {
      return "";
    }
  }

  writeBuffer(value: Buffer): OsuBuffer {
    this.buffer = Buffer.concat([this.buffer, value]);
    return this;
  }

  writeUInt(value: number, byteLength: number): OsuBuffer {
    const buff = Buffer.alloc(byteLength);
    buff.writeUIntLE(value, 0, byteLength);

    return this.writeBuffer(buff);
  }

  writeInt(value: number, byteLength: number) {
    const buff = Buffer.alloc(byteLength);
    buff.writeIntLE(value, 0, byteLength);

    return this.writeBuffer(buff);
  }

  writeByte(value: number) {
    return this.writeBuffer(Buffer.alloc(1, value));
  }

  writeBytes(value: Array<any>) {
    return this.writeBuffer(Buffer.from(value));
  }

  writeUInt8(value: number) {
    return this.writeUInt(value, 1);
  }

  writeInt8(value: number) {
    return this.writeInt(value, 1);
  }

  writeUInt16(value: number) {
    return this.writeUInt(value, 2);
  }

  writeInt16(value: number) {
    return this.writeInt(value, 2);
  }

  writeUInt32(value: number) {
    return this.writeUInt(value, 4);
  }

  writeInt32(value: number) {
    return this.writeInt(value, 4);
  }

  writeUInt64(value: number) {
    const buff = Buffer.alloc(8);
    buff.writeUInt32LE(value >> 8, 0);
    buff.writeUInt32LE(value & 0x00ff, 4);

    return this.writeBuffer(buff);
  }

  writeInt64(value: number) {
    const buff = Buffer.alloc(8);
    buff.writeInt32LE(value >> 8, 0);
    buff.writeInt32LE(value & 0x00ff, 4);

    return this.writeBuffer(buff);
  }

  writeFloat(value: number) {
    const buff = Buffer.alloc(4);
    buff.writeFloatLE(value, 0);

    return this.writeBuffer(buff);
  }

  writeDouble(value: number) {
    const buff = Buffer.alloc(8);
    buff.writeDoubleLE(value, 0);

    return this.writeBuffer(buff);
  }

  writeString(value: string) {
    const buff = Buffer.alloc(Buffer.byteLength(value, "utf8"));
    buff.write(value);

    return this.writeBuffer(buff);
  }

  writeBoolean(value: number) {
    return this.writeByte(value ? 1 : 0);
  }

  writeOsuString(value: string, nullable = false) {
    if (value.length === 0 && nullable) {
      this.writeByte(0);
    } else if (value.length === 0) {
      this.writeByte(11);
      this.writeByte(0);
    } else {
      this.writeByte(11);
      this.writeVarInt(Buffer.byteLength(value, "utf8"));
      this.writeString(value);
    }
    return this;
  }

  writeVarInt(value: number) {
    const arr: any[] = [];
    let len = 0;
    do {
      arr[len] = value & 0x7f;
      if ((value >>= 7) !== 0) arr[len] |= 0x80;
      len++;
    } while (value > 0);

    return this.writeBuffer(Buffer.from(arr));
  }

  writeULeb128(value: number) {
    return this.writeVarInt(value);
  }
}
