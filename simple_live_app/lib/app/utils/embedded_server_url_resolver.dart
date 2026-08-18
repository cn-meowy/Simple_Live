import 'package:simple_live_app/app/services/embedded_live_server.dart';
import 'package:simple_live_app/app/utils/local_ip_util.dart';
import 'package:simple_live_app/app/utils/server_url_util.dart';

/// 测试连接前，把输入 URL 解析到 EmbeddedLiveServer 真实地址的工具。
///
/// 场景：用户输入 `http://localhost` / `http://127.0.0.1` 等本机地址但漏掉端口，
/// EmbeddedLiveServer 可能以随机端口或指定端口启动，直接探测 `/health` 会因
/// 端口缺失/不匹配而失败。此工具在嵌入式服务已运行时自动拼上正确端口，
/// 避免每次启动随机端口都要用户再去查日志。
///
/// 分支：
/// - 显式端口 (hasPort && port > 0)：原样返回，不改用户输入。
/// - loopback host (127.0.0.1 / localhost / ::1)：保留 host，拼接运行中服务的端口。
/// - 其他本机 host（含 LAN IP / 0.0.0.0 / ';' 多 IP）：要求与已绑 host 一致才
///   替换为 `baseUrl`，不一致则原样返回。
/// - 非本机或嵌入式服务未运行：原样返回。
class EmbeddedServerUrlResolver {
  EmbeddedServerUrlResolver._();

  static const _loopbacks = {'127.0.0.1', 'localhost', '::1'};

  static Future<String> resolve(String input) async {
    if (input.isEmpty) return input;

    Uri uri;
    try {
      uri = Uri.parse(ServerUrlUtil.normalize(input));
    } catch (_) {
      return input.trim();
    }

    if (uri.hasPort && uri.port > 0) return input;

    if (!await LocalIpUtil.isLocalHost(input)) return input;

    final server = EmbeddedLiveServer.instance;
    if (!server.isRunning) return input;
    final baseUrl = server.baseUrl;
    if (baseUrl == null) return input;

    final serverUri = Uri.parse(baseUrl);
    final serverPort = serverUri.port;
    if (serverPort <= 0) return input;

    var inputHost = uri.host;
    if (inputHost.contains(';')) {
      inputHost = inputHost.split(';').first.trim();
    }
    if (inputHost == '0.0.0.0') {
      final ips = await LocalIpUtil.getLocalIpList();
      if (ips.isEmpty) return input;
      inputHost = ips.first;
    }

    if (_loopbacks.contains(inputHost)) {
      final scheme = uri.scheme.isEmpty ? serverUri.scheme : uri.scheme;
      return Uri(scheme: scheme, host: inputHost, port: serverPort).toString();
    }

    if (serverUri.host == inputHost) return baseUrl;

    return input;
  }
}