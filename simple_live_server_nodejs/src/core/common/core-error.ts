/**
 * 核心错误
 *
 * 对应 Dart 版 simple_live_core/lib/src/common/core_error.dart
 */

export class CoreError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 0) {
    super(message);
    this.name = 'CoreError';
    this.statusCode = statusCode;
  }
}
