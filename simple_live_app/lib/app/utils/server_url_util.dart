/// 服务端地址输入规范化工具
class ServerUrlUtil {
  ServerUrlUtil._();

  /// 规范化用户输入的服务端地址：
  /// - trim 前后空白
  /// - 去除尾部斜杠（避免拼接 /health 时出现 //health）
  /// - 修复 iOS 键盘吞冒号场景：`https//host` → `https://host`
  /// - 缺 scheme 时自动补 `https://`
  /// - 大写 scheme 规范为小写
  /// - 非 http/https scheme 抛 [ArgumentError]
  /// - 仅空白/斜杠的输入返回空字符串
  static String normalize(String input) {
    var s = input.trim();
    // 去除全部尾部斜杠
    s = s.replaceAll(RegExp(r'/+$'), '');
    if (s.isEmpty) return '';

    // 修复 iOS 键盘吞冒号：https// 或 http// → https:// 或 http://
    s = s.replaceFirst(RegExp(r'^https//', caseSensitive: false), 'https://');
    s = s.replaceFirst(RegExp(r'^http//', caseSensitive: false), 'http://');

    final lower = s.toLowerCase();
    if (lower.startsWith('https://') || lower.startsWith('http://')) {
      // 规范 scheme 为小写，保留 host 原样
      if (lower.startsWith('https://')) {
        s = 'https://${s.substring(8)}';
      } else {
        s = 'http://${s.substring(7)}';
      }
      return s;
    }

    // 检测是否有其他 scheme（xxx://）
    final schemeMatch = RegExp(r'^([a-zA-Z][a-zA-Z0-9+.-]*)://').firstMatch(s);
    if (schemeMatch != null) {
      throw ArgumentError('不支持的协议: ${schemeMatch.group(1)}，仅支持 http/https');
    }

    // 缺 scheme：补 https://
    return 'https://$s';
  }
}
