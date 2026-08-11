import 'dart:io';

import 'package:simple_live_app/app/log.dart';

/// 本机 IP / 本机地址识别工具
class LocalIpUtil {
  LocalIpUtil._();

  /// 缓存的本机网卡 IPv4 列表（避免重复扫描）
  static List<String>? _localIpCache;

  /// 获取本机所有网卡 IPv4 地址（排除回环/组播）
  static Future<List<String>> getLocalIpList() async {
    if (_localIpCache != null) return _localIpCache!;
    final result = <String>[];
    try {
      final interfaces = await NetworkInterface.list();
      for (final interface in interfaces) {
        for (final addr in interface.addresses) {
          if (addr.type == InternetAddressType.IPv4 &&
              !addr.address.startsWith('127') &&
              !addr.isMulticast &&
              !addr.isLoopback) {
            result.add(addr.address);
          }
        }
      }
    } catch (e) {
      Log.logPrint(e);
    }
    _localIpCache = result;
    return result;
  }

  /// 判断给定 url 的 host 是否为本机地址。
  ///
  /// 命中以下任一即视为本机：
  /// - `127.0.0.1` / `localhost` / `::1`
  /// - `0.0.0.0`
  /// - 本机任一网卡 IPv4 地址
  static Future<bool> isLocalHost(String url) async {
    if (url.isEmpty) return false;
    String host;
    try {
      host = Uri.parse(url).host;
    } catch (_) {
      return false;
    }
    if (host.isEmpty) return false;

    const loopback = {'127.0.0.1', 'localhost', '::1', '0.0.0.0'};
    if (loopback.contains(host)) return true;

    // 用户可能用 `;` 分隔多 IP
    if (host.contains(';')) {
      final parts = host.split(';').map((e) => e.trim()).where((e) => e.isNotEmpty);
      for (final p in parts) {
        if (loopback.contains(p)) return true;
        if (await _matchLocalIp(p)) return true;
      }
      return false;
    }

    return _matchLocalIp(host);
  }

  static Future<bool> _matchLocalIp(String host) async {
    final localIps = await getLocalIpList();
    return localIps.contains(host);
  }
}
