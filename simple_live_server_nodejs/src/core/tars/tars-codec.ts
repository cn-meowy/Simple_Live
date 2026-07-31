/**
 * Tars 编解码器实现
 *
 * 对应 Dart 版 tars_dart 的 TarsOutputStream + TarsInputStream
 * 实现完整的 Tars 二进制序列化协议。
 */

import { TarsStructType, TarsConst, TarsStruct } from './tars-struct.js';

// ===================== TarsOutputStream =====================

/**
 * Tars 输出流（编码器）
 *
 * 对应 Dart 版 TarsOutputStream
 */
export class TarsOutputStream {
  private buffer: number[] = [];

  /** 写入头部（tag + type） */
  writeHead(type: number, tag: number): void {
    if (tag < 15) {
      this.buffer.push((tag << 4) | type);
    } else if (tag < 256) {
      this.buffer.push((15 << 4) | type);
      this.buffer.push(tag & 0xff);
    } else {
      throw new Error(`tag is too large: ${tag}`);
    }
  }

  /** 通用写入方法 */
  write(data: unknown, tag: number): void {
    if (typeof data === 'number') {
      if (Number.isInteger(data)) {
        this.writeInt(data, tag);
      } else {
        this.writeDouble(data, tag);
      }
    } else if (typeof data === 'boolean') {
      this.writeBool(data, tag);
    } else if (typeof data === 'string') {
      this.writeString(data, tag);
    } else if (data instanceof Uint8Array) {
      this.writeBytes(data, tag);
    } else if (data instanceof TarsStruct) {
      this.writeStruct(data, tag);
    } else if (Array.isArray(data)) {
      this.writeList(data, tag);
    } else if (data instanceof Map) {
      this.writeMap(data, tag);
    } else if (data !== null && typeof data === 'object') {
      this.writeMap(data as Record<string, unknown>, tag);
    } else if (data === null || data === undefined) {
      this.writeString('', tag);
    } else {
      throw new Error(`type: ${typeof data} not supported.`);
    }
  }

  writeBool(b: boolean, tag: number): void {
    this.writeByte(b ? 1 : 0, tag);
  }

  writeByte(b: number, tag: number): void {
    if (b === 0) {
      this.writeHead(TarsStructType.ZERO_TAG, tag);
    } else {
      this.writeHead(TarsStructType.BYTE, tag);
      this.buffer.push(b & 0xff);
    }
  }

  /** 写入整数（自动选择 int1/int2/int4/int8） */
  writeInt(n: number, tag: number): void {
    if (n >= -128 && n <= 127) {
      this.writeByte(n, tag);
      return;
    }
    if (n >= -32768 && n <= 32767) {
      this.writeHead(TarsStructType.SHORT, tag);
      const buf = Buffer.alloc(2);
      buf.writeInt16BE(n, 0);
      this.buffer.push(...buf);
      return;
    }
    if (n >= -2147483648 && n <= 2147483647) {
      this.writeHead(TarsStructType.INT, tag);
      const buf = Buffer.alloc(4);
      buf.writeInt32BE(n, 0);
      this.buffer.push(...buf);
      return;
    }
    // int64 - 使用 BigInt
    this.writeHead(TarsStructType.LONG, tag);
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(n), 0);
    this.buffer.push(...buf);
  }

  writeFloat(n: number, tag: number): void {
    this.writeHead(TarsStructType.FLOAT, tag);
    const buf = Buffer.alloc(4);
    buf.writeFloatBE(n, 0);
    this.buffer.push(...buf);
  }

  writeDouble(n: number, tag: number): void {
    this.writeHead(TarsStructType.DOUBLE, tag);
    const buf = Buffer.alloc(8);
    buf.writeDoubleBE(n, 0);
    this.buffer.push(...buf);
  }

  /** 写入字符串（string1/string4） */
  writeString(s: string, tag: number): void {
    const bytes = Buffer.from(s, 'utf-8');
    if (bytes.length === 0) {
      this.writeHead(TarsStructType.STRING1, tag);
      this.buffer.push(0);
      return;
    }
    if (bytes.length > 255) {
      this.writeHead(TarsStructType.STRING4, tag);
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeInt32BE(bytes.length, 0);
      this.buffer.push(...lenBuf);
      this.buffer.push(...bytes);
    } else {
      this.writeHead(TarsStructType.STRING1, tag);
      this.buffer.push(bytes.length);
      this.buffer.push(...bytes);
    }
  }

  /** 写入 byte[] (SimpleList) */
  writeBytes(data: Uint8Array, tag: number): void {
    this.writeHead(TarsStructType.SIMPLE_LIST, tag);
    this.writeHead(TarsStructType.BYTE, 0);
    this.writeInt(data.length, 0);
    this.buffer.push(...Array.from(data));
  }

  /** 写入 Map */
  writeMap(map: Map<unknown, unknown> | Record<string, unknown>, tag: number): void {
    this.writeHead(TarsStructType.MAP, tag);
    let size: number;
    if (map instanceof Map) {
      size = map.size;
    } else {
      size = Object.keys(map).length;
    }
    this.writeInt(size, 0);

    if (map instanceof Map) {
      for (const [key, value] of map) {
        this.write(key, 0);
        this.write(value, 1);
      }
    } else {
      for (const [key, value] of Object.entries(map)) {
        this.write(key, 0);
        this.write(value, 1);
      }
    }
  }

  /** 写入 List */
  writeList(list: unknown[], tag: number): void {
    this.writeHead(TarsStructType.LIST, tag);
    this.writeInt(list.length, 0);
    for (const item of list) {
      this.write(item, 0);
    }
  }

  /** 写入自定义结构 */
  writeStruct(o: TarsStruct, tag: number): void {
    this.writeHead(TarsStructType.STRUCT_BEGIN, tag);
    o.writeTo(this);
    this.writeHead(TarsStructType.STRUCT_END, 0);
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  toBuffer(): Buffer {
    return Buffer.from(this.buffer);
  }
}

// ===================== TarsInputStream =====================

interface HeadData {
  type: number;
  tag: number;
}

/**
 * Tars 输入流（解码器）
 *
 * 对应 Dart 版 TarsInputStream
 */
export class TarsInputStream {
  private buffer: Buffer;
  private _position: number;

  constructor(buffer: Uint8Array | Buffer, pos = 0) {
    this.buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    this._position = pos;
  }

  wrap(buffer: Uint8Array | Buffer, pos = 0): void {
    this.buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    this._position = pos;
  }

  get length(): number {
    return this.buffer.length;
  }

  get position(): number {
    return this._position;
  }

  set position(value: number) {
    this._position = value;
  }

  private readByte(): number {
    const byte = this.buffer[this._position];
    this._position += 1;
    return byte;
  }

  private readIntBE(len: number): number {
    const bytes = this.buffer.subarray(this._position, this._position + len);
    let result = 0;
    if (len === 1) {
      result = bytes.readUInt8(0);
    } else if (len === 2) {
      result = bytes.readInt16BE(0);
    } else if (len === 4) {
      result = bytes.readInt32BE(0);
    } else if (len === 8) {
      result = Number(bytes.readBigInt64BE(0));
    }
    this._position += len;
    return result;
  }

  private readHead(hd: HeadData): number {
    if (this._position >= this.buffer.length) {
      throw new Error('read file to end');
    }
    const b = this.readByte();
    hd.type = b & 0x0f;
    hd.tag = (b & 0xf0) >> 4;
    if (hd.tag === 15) {
      hd.tag = this.readByte();
      return 2;
    }
    return 1;
  }

  private peakHead(hd: HeadData): number {
    const curPos = this._position;
    const len = this.readHead(hd);
    this._position = curPos;
    return len;
  }

  private skip(len: number): void {
    this._position += len;
  }

  private skipToTag(tag: number): boolean {
    try {
      const hd: HeadData = { type: 0, tag: 0 };
      while (true) {
        this.peakHead(hd);
        if (tag <= hd.tag || hd.type === TarsStructType.STRUCT_END) {
          return tag === hd.tag;
        }
        const len = this.peakHead(hd);
        this.skip(len);
        this.skipFieldWithType(hd.type);
      }
    } catch {
      return false;
    }
  }

  private skipToStructEnd(): void {
    const hd: HeadData = { type: 0, tag: 0 };
    do {
      this.readHead(hd);
      this.skipFieldWithType(hd.type);
    } while (hd.type !== TarsStructType.STRUCT_END);
  }

  private skipField(): void {
    const hd: HeadData = { type: 0, tag: 0 };
    this.readHead(hd);
    this.skipFieldWithType(hd.type);
  }

  private skipFieldWithType(type: number): void {
    switch (type) {
      case TarsStructType.BYTE:
        this.skip(1);
        break;
      case TarsStructType.SHORT:
        this.skip(2);
        break;
      case TarsStructType.INT:
        this.skip(4);
        break;
      case TarsStructType.LONG:
        this.skip(8);
        break;
      case TarsStructType.FLOAT:
        this.skip(4);
        break;
      case TarsStructType.DOUBLE:
        this.skip(8);
        break;
      case TarsStructType.STRING1: {
        let len = this.readByte();
        if (len < 0) len += 256;
        this.skip(len);
        break;
      }
      case TarsStructType.STRING4: {
        this.skip(this.readIntBE(4));
        break;
      }
      case TarsStructType.MAP: {
        const size = this.readInt(0, true);
        for (let i = 0; i < size * 2; i++) {
          this.skipField();
        }
        break;
      }
      case TarsStructType.LIST: {
        const size = this.readInt(0, true);
        for (let i = 0; i < size; i++) {
          this.skipField();
        }
        break;
      }
      case TarsStructType.SIMPLE_LIST: {
        const hd: HeadData = { type: 0, tag: 0 };
        this.readHead(hd);
        if (hd.type !== TarsStructType.BYTE) {
          throw new Error('skipField with invalid type');
        }
        const size = this.readInt(0, true);
        this.skip(size);
        break;
      }
      case TarsStructType.STRUCT_BEGIN:
        this.skipToStructEnd();
        break;
      case TarsStructType.STRUCT_END:
      case TarsStructType.ZERO_TAG:
        break;
    }
  }

  /** 读取整数 */
  readInt(tag: number, isRequire: boolean): number {
    let n = 0;
    if (this.skipToTag(tag)) {
      const hd: HeadData = { type: 0, tag: 0 };
      this.readHead(hd);
      switch (hd.type) {
        case TarsStructType.ZERO_TAG:
          n = 0;
          break;
        case TarsStructType.BYTE:
          n = this.readIntBE(1);
          break;
        case TarsStructType.SHORT:
          n = this.readIntBE(2);
          break;
        case TarsStructType.INT:
          n = this.readIntBE(4);
          break;
        case TarsStructType.LONG:
          n = this.readIntBE(8);
          break;
        default:
          throw new Error('type mismatch.');
      }
    } else if (isRequire) {
      throw new Error('require field not exist.');
    }
    return n;
  }

  /** 读取布尔 */
  readBool(tag: number, isRequire: boolean): boolean {
    return this.readInt(tag, isRequire) !== 0;
  }

  /** 读取字符串 */
  readString(tag: number, isRequire: boolean): string {
    let s = '';
    if (this.skipToTag(tag)) {
      const hd: HeadData = { type: 0, tag: 0 };
      this.readHead(hd);
      switch (hd.type) {
        case TarsStructType.STRING1: {
          let len = this.readByte();
          if (len < 0) len += 256;
          const bytes = this.buffer.subarray(this._position, this._position + len);
          s = bytes.toString('utf-8');
          this._position += len;
          break;
        }
        case TarsStructType.STRING4: {
          const len = this.readIntBE(4);
          const bytes = this.buffer.subarray(this._position, this._position + len);
          s = bytes.toString('utf-8');
          this._position += len;
          break;
        }
        default:
          throw new Error('type mismatch.');
      }
    } else if (isRequire) {
      throw new Error('require field not exist.');
    }
    return s;
  }

  /** 读取字节数组 */
  readBytes(tag: number, isRequire: boolean): Uint8Array {
    let bytes = new Uint8Array();
    if (this.skipToTag(tag)) {
      const hd: HeadData = { type: 0, tag: 0 };
      this.readHead(hd);
      switch (hd.type) {
        case TarsStructType.SIMPLE_LIST: {
          this.readHead(hd);
          if (hd.type as number !== TarsStructType.BYTE as number) {
            throw new Error('type mismatch, tag: ' + tag);
          }
          const len = this.readInt(0, true);
          bytes = new Uint8Array(this.buffer.subarray(this._position, this._position + len));
          this._position += len;
          break;
        }
        case TarsStructType.LIST: {
          const len = this.readInt(0, true);
          bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = this.readInt(0, true);
          }
          break;
        }
        default:
          throw new Error('type mismatch.');
      }
    } else if (isRequire) {
      throw new Error('require field not exist.');
    }
    return bytes;
  }

  /** 读取 Map<string, Uint8Array>（TUP3 格式） */
  readStringBytesMap(tag: number, isRequire: boolean): Map<string, Uint8Array> {
    const map = new Map<string, Uint8Array>();
    if (this.skipToTag(tag)) {
      const hd: HeadData = { type: 0, tag: 0 };
      this.readHead(hd);
      if (hd.type !== TarsStructType.MAP) {
        throw new Error('type mismatch.');
      }
      const size = this.readInt(0, true);
      for (let i = 0; i < size; i++) {
        const key = this.readString(0, true);
        const value = this.readBytes(1, true);
        map.set(key, value);
      }
    } else if (isRequire) {
      throw new Error('require field not exist.');
    }
    return map;
  }

  /** 读取自定义结构 */
  readStruct<T extends TarsStruct>(proxy: T, tag: number, isRequire: boolean): T {
    if (this.skipToTag(tag)) {
      const hd: HeadData = { type: 0, tag: 0 };
      this.readHead(hd);
      if (hd.type !== TarsStructType.STRUCT_BEGIN) {
        throw new Error('type mismatch.');
      }
      proxy.readFrom(this);
      this.skipToStructEnd();
      return proxy;
    } else if (isRequire) {
      throw new Error('require field not exist.');
    }
    return proxy;
  }

  /** 读取 Map<string, string> */
  readStringStringMap(tag: number, isRequire: boolean): Map<string, string> {
    const map = new Map<string, string>();
    if (this.skipToTag(tag)) {
      const hd: HeadData = { type: 0, tag: 0 };
      this.readHead(hd);
      if (hd.type !== TarsStructType.MAP) {
        throw new Error('type mismatch.');
      }
      const size = this.readInt(0, true);
      for (let i = 0; i < size; i++) {
        const key = this.readString(0, true);
        const value = this.readString(1, true);
        map.set(key, value);
      }
    } else if (isRequire) {
      throw new Error('require field not exist.');
    }
    return map;
  }
}

// 导出常量供外部使用
export { TarsStructType, TarsConst, TarsStruct };
