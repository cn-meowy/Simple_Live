/**
 * 类型转换辅助
 *
 * 对应 Dart 版 simple_live_core/lib/src/common/convert_helper.dart
 */

/**
 * 安全类型转换，类似 Dart 的 asT<T>
 * 从 dynamic 类型安全提取指定类型值
 */
export function asT<T>(value: unknown): T | null {
  return (value as T) ?? null;
}

/**
 * 安全获取数字
 */
export function asNumber(value: unknown, defaultValue = 0): number {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/**
 * 安全获取字符串
 */
export function asString(value: unknown, defaultValue = ''): string {
  if (value === null || value === undefined) return defaultValue;
  return String(value);
}

/**
 * 安全获取布尔值
 */
export function asBoolean(value: unknown, defaultValue = false): boolean {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return defaultValue;
}
