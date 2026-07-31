/**
 * Tars 结构类型枚举
 *
 * 对应 Dart 版 tars_dart/lib/tars/codec/tars_struct.dart 的 TarsStructType
 */

export enum TarsStructType {
  BYTE = 0,
  SHORT = 1,
  INT = 2,
  LONG = 3,
  FLOAT = 4,
  DOUBLE = 5,
  STRING1 = 6,
  STRING4 = 7,
  MAP = 8,
  LIST = 9,
  STRUCT_BEGIN = 10,
  STRUCT_END = 11,
  ZERO_TAG = 12,
  SIMPLE_LIST = 13,
}

/** 协议常量 */
export const TarsConst = {
  PACKET_TYPE_TARSNORMAL: 0,
  PACKET_TYPE_TARSONEWAY: 1,
  PACKET_TYPE_TUP: 2,
  PACKET_TYPE_TUP3: 3,
  STATUS_RESULT_CODE: 'STATUS_RESULT_CODE',
  STATUS_RESULT_DESC: 'STATUS_RESULT_DESC',
};

/**
 * TarsStruct 抽象基类
 *
 * 对应 Dart 版 TarsStruct
 */
export abstract class TarsStruct {
  static TARS_MAX_STRING_LENGTH = 100 * 1024 * 1024;

  abstract writeTo(os: TarsOutputStream): void;
  abstract readFrom(is_: TarsInputStream): void;

  toByteArray(): Uint8Array {
    // 延迟导入避免循环依赖
    const { TarsOutputStream } = require('./tars-codec.js') as typeof import('./tars-codec.js');
    const os = new TarsOutputStream();
    this.writeTo(os);
    return os.toUint8Array();
  }
}

// 前向引用，避免循环依赖
import type { TarsOutputStream, TarsInputStream } from './tars-codec.js';
