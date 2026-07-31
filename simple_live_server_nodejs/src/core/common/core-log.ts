/**
 * 日志工具
 *
 * 对应 Dart 版 simple_live_core/lib/src/common/core_log.dart
 */

export enum LogLevel {
  Info = 'INFO',
  Warn = 'WARN',
  Error = 'ERROR',
  Debug = 'DEBUG',
}

export type LogHandler = (level: LogLevel, message: string) => void;

export class CoreLog {
  static enableLog = true;
  static onPrintLog: LogHandler | null = null;

  static info(message: string): void {
    this.log(LogLevel.Info, message);
  }

  static i(message: string): void {
    this.log(LogLevel.Info, message);
  }

  static warn(message: string): void {
    this.log(LogLevel.Warn, message);
  }

  static w(message: string): void {
    this.log(LogLevel.Warn, message);
  }

  static error(message: unknown): void {
    this.log(LogLevel.Error, message instanceof Error ? message.message : String(message));
  }

  static debug(message: string): void {
    this.log(LogLevel.Debug, message);
  }

  static d(message: string): void {
    this.log(LogLevel.Debug, message);
  }

  private static log(level: LogLevel, message: string): void {
    if (!this.enableLog) return;
    if (this.onPrintLog) {
      this.onPrintLog(level, message);
    } else {
      console.log(`[${level}] ${message}`);
    }
  }
}
