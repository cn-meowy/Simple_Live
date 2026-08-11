import 'dart:convert';

import 'package:dart_quickjs/dart_quickjs.dart';

import '../common/core_log.dart';

/// JS 引擎封装
///
/// 基于 dart_quickjs (QuickJS-ng) 的轻量封装。
/// 每个实例持有一个独立的 [JsRuntime]，可反复执行脚本与调用函数，
/// 用完需调用 [dispose] 释放原生资源。
///
/// 注意：dart_quickjs 的 eval/call 均为同步调用，且不支持将 Dart
/// 回调注册为 JS 可调用对象。因此 JS 脚本不能在内部直接发起网络请求，
/// 需要联网时应返回请求描述符，由 Dart 侧完成 HTTP 后再回调 JS 解析。
class JsEngine {
  JsRuntime? _runtime;
  bool _disposed = false;

  /// 内存上限（字节），0 表示不限
  final int memoryLimit;

  /// 栈大小上限（字节），0 表示默认
  final int maxStackSize;

  JsEngine({
    this.memoryLimit = 8 * 1024 * 1024,
    this.maxStackSize = 128 * 1024,
  });

  /// 当前底层运行时，按需惰性创建
  JsRuntime get runtime {
    if (_disposed) {
      throw StateError('JsEngine has been disposed');
    }
    _runtime ??= JsRuntime(
      memoryLimit: memoryLimit,
      maxStackSize: maxStackSize,
    );
    return _runtime!;
  }

  /// 是否已释放
  bool get isDisposed => _disposed;

  /// 执行一段 JS 代码，返回原生 Dart 值
  dynamic eval(String code, {String filename = '<eval>'}) {
    try {
      return runtime.eval(code, filename: filename);
    } catch (e, s) {
      CoreLog.e('JsEngine.eval 失败: $e', s);
      rethrow;
    }
  }

  /// 执行一段 JS 代码并断言结果为字符串
  String evalString(String code, {String filename = '<eval>'}) {
    final result = eval(code, filename: filename);
    return result?.toString() ?? '';
  }

  /// 调用已存在的全局函数 [name]，传入 JSON 可序列化的参数，
  /// 返回原生 Dart 值。
  ///
  /// 参数会被 JSON 编码后注入，避免类型转换的边界问题。
  dynamic callGlobal(String name, List<dynamic> args) {
    final argList = args.map((e) => jsonEncode(e)).join(',');
    final code = 'globalThis.$name && globalThis.$name($argList)';
    return eval(code);
  }

  /// 判断全局函数 [name] 是否存在
  bool hasFunction(String name) {
    final result = eval('typeof globalThis.$name === "function"');
    return result == true;
  }

  /// 执行全局函数并以 JSON 字符串形式获取返回值。
  ///
  /// 对象/数组类型通过 JSON.stringify 规整输出，便于 Dart 侧反序列化。
  /// 标量类型直接返回其字符串形式。
  dynamic callGlobalJson(String name, List<dynamic> args) {
    final argList = args.map((e) => jsonEncode(e)).join(',');
    final code = '''
(function() {
  var fn = globalThis.$name;
  if (typeof fn !== 'function') {
    throw new Error("函数不存在: $name");
  }
  var r = fn($argList);
  if (r === undefined || r === null) return null;
  if (typeof r === 'object') {
    return JSON.stringify(r);
  }
  return r;
})()
''';
    final result = eval(code);
    if (result is String) {
      // 可能是 JSON 字符串或普通标量字符串
      final trimmed = result.trim();
      if (trimmed.isEmpty) return null;
      if (trimmed == 'null') return null;
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return jsonDecode(trimmed);
        } catch (_) {
          return result;
        }
      }
      return result;
    }
    return result;
  }

  /// 释放原生资源
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _runtime?.dispose();
    _runtime = null;
  }
}
