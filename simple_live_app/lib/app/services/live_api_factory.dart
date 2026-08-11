import 'dart:async';

import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/app/services/embedded_live_server.dart';
import 'package:simple_live_app/app/services/live_api_service.dart';
import 'package:simple_live_app/app/services/remote_live_api.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_app/app/utils/local_ip_util.dart';
import 'package:simple_live_app/app/utils/server_url_util.dart';
import 'package:simple_live_app/core/simple_live_core.dart';
import 'package:simple_live_app/requests/http_client.dart';

/// LiveApi 工厂类
///
/// 根据 `serverUrl` 配置返回 [RemoteLiveApi] 实例：
/// - 地址为本机（`127.0.0.1`/`localhost`/本机网卡 IP）→ 自动启动 [EmbeddedLiveServer]，
///   用其随机端口 baseUrl 构造 [RemoteLiveApi]。
/// - 地址为非本机 → 用该地址构造 [RemoteLiveApi]，并关闭内嵌服务。
/// - 地址为空 → 抛 [StateError]（懒启动，首访时报错而非启动期崩溃）。
///
/// 配置变更时需调用 [reset]，下次访问 [instance] 会重新判定并按需启停内嵌服务。
class LiveApiFactory {
  static LiveApiService? _instance;

  /// 创建实例的互斥锁：reset() 后并发的 instanceAsync 调用只允许一个进入
  /// _createInstanceAsync，其余等待同一个 Completer，确保所有调用方拿到
  /// 同一个新实例（避免并发各自创建、部分拿到旧实例）。
  static Completer<LiveApiService>? _createCompleter;

  /// 可测试性钩子：测试通过 overrideCreateInstance 注入假创建器，
  /// 避免依赖真实 GetX 环境 / 内嵌服务。restoreCreateInstance 还原默认。
  static Future<LiveApiService> Function()? _createInstanceOverride;
  static void overrideCreateInstance(
      Future<LiveApiService> Function() creator) {
    _createInstanceOverride = creator;
  }

  static void restoreCreateInstance() {
    _createInstanceOverride = null;
  }

  /// 获取当前 [LiveApiService] 实例（同步）。
  ///
  /// 返回缓存实例；若尚未就绪（首次访问或 [reset] 后未重建）则抛 [StateError]。
  /// 调用方应优先使用 [instanceAsync] 以确保内嵌服务已启动。
  static LiveApiService get instance {
    final api = _instance;
    if (api == null) {
      throw StateError('LiveApi 尚未就绪，请使用 LiveApiFactory.instanceAsync');
    }
    return api;
  }

  /// 异步获取 [LiveApiService] 实例，确保内嵌服务已启动。
  ///
  /// reset() 后并发调用通过 [_createCompleter] 互斥，只创建一次实例。
  /// 错误经 completer.future 统一传递，调用方自行 try/catch；失败不缓存实例，
  /// completer 在 finally 中清空，后续调用可重试。
  static Future<LiveApiService> get instanceAsync {
    if (_instance != null) {
      return Future.value(_instance);
    }
    // 已有创建在进行中：复用同一个 Completer，避免重复创建
    final existing = _createCompleter;
    if (existing != null) {
      return existing.future;
    }
    final completer = Completer<LiveApiService>();
    _createCompleter = completer;
    // 创建过程异步执行，结果统一写入 completer；不在此 rethrow，避免
    // completer.future 无监听者时 completeError 被判为未处理错误。
    _createInstanceAsync().then((api) {
      _instance = api;
      completer.complete(api);
    }).catchError((Object e, StackTrace s) {
      completer.completeError(e, s);
    }).whenComplete(() {
      _createCompleter = null;
    });
    return completer.future;
  }

  /// 创建实例（异步：可能需启动内嵌服务）
  static Future<LiveApiService> _createInstanceAsync() async {
    final override = _createInstanceOverride;
    if (override != null) {
      return override();
    }
    final settings = AppSettingsController.instance;
    final serverUrl = settings.serverUrl.value;

    if (serverUrl.isEmpty) {
      throw StateError('未配置服务端地址');
    }

    final isLocal = await LocalIpUtil.isLocalHost(serverUrl);

    if (isLocal) {
      // 本机：启动内嵌服务，用回环地址 + 随机端口作为 baseUrl
      final baseUrl = await EmbeddedLiveServer.instance.start();
      return RemoteLiveApi(baseUrl);
    }

    // 非本机：关闭内嵌服务，用远程地址
    await EmbeddedLiveServer.instance.stop();
    return RemoteLiveApi(serverUrl);
  }

  /// 重置实例
  ///
  /// 当服务端地址变更时调用，下次访问 [instance] 时会重新创建并按需启停内嵌服务。
  static void reset() {
    _instance = null;
  }

  /// 检测服务端是否可用
  ///
  /// 通过 GET /health 接口验证服务端是否正常运行。
  static Future<bool> checkServerAvailable(String url) async {
    String normalized;
    try {
      normalized = ServerUrlUtil.normalize(url);
    } catch (_) {
      normalized = url.trim();
    }
    try {
      final result = await HttpClient.instance.getText('$normalized/health');
      return result == 'ok';
    } catch (e) {
      return false;
    }
  }

  /// 获取弹幕处理器（同步）
  ///
  /// 弹幕始终直连 core（[Sites.allSites]），不走服务端中转，
  /// 故不依赖内嵌服务是否就绪。
  ///
  /// 未知平台（含服务端 demo 模式的虚拟平台、未注册的 JS 站点等）
  /// 返回默认 no-op [LiveDanmaku]，避免崩溃阻断直播间构建。
  static LiveDanmaku getDanmaku(String siteId) {
    final site = Sites.allSites[siteId];
    final liveSite = site?.liveSite;
    if (liveSite != null) {
      return liveSite.getDanmaku();
    }
    return LiveDanmaku();
  }
}
