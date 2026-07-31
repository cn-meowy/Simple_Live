/**
 * 二进制写入器
 *
 * 对应 Dart 版 simple_live_core/lib/src/common/binary_writer.dart
 * 用于构建各平台的二进制协议数据包（如 B站弹幕协议头）。
 */

export class BinaryWriter {
  private _buffer: number[] = [];

  constructor(initial: number[] = []) {
    this._buffer = [...initial];
  }

  get buffer(): number[] {
    return this._buffer;
  }

  get length(): number {
    return this._buffer.length;
  }

  /** 写入整数（大端序） */
  writeInt(value: number, byteLength: number): void {
    const bytes: number[] = [];
    let v = value;
    for (let i = 0; i < byteLength; i++) {
      bytes.unshift(v & 0xff);
      v = Math.floor(v / 256);
    }
    this._buffer.push(...bytes);
  }

  /** 写入字节数组 */
  writeBytes(data: number[] | Uint8Array | Buffer): void {
    if (Buffer.isBuffer(data)) {
      this._buffer.push(...Array.from(data));
    } else if (data instanceof Uint8Array) {
      this._buffer.push(...Array.from(data));
    } else {
      this._buffer.push(...data);
    }
  }

  /** 写入单个字节 */
  writeByte(value: number): void {
    this._buffer.push(value & 0xff);
  }

  /** 转为 Buffer */
  toBuffer(): Buffer {
    return Buffer.from(this._buffer);
  }

  /** 转为 Uint8Array */
  toUint8Array(): Uint8Array {
    return new Uint8Array(this._buffer);
  }
}

/**
 * 从 Buffer 读取大端序整数
 *
 * 对应 Dart 版 BiliBiliDanmaku.readInt
 */
export function readInt(buffer: Buffer | number[], start: number, len: number): number {
  const bytes = Buffer.isBuffer(buffer)
    ? buffer.subarray(start, start + len)
    : Buffer.from(buffer.slice(start, start + len));

  if (len === 1) return bytes.readUInt8(0);
  if (len === 2) return bytes.readInt16BE(0);
  if (len === 4) return bytes.readInt32BE(0);
  if (len === 8) return Number(bytes.readBigInt64BE(0));
  return 0;
}
