import 'package:simple_live_tv_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_tv_app/app/services/live_api_service.dart';
import 'package:simple_live_tv_app/app/services/local_live_api.dart';
import 'package:simple_live_tv_app/app/services/remote_live_api.dart';
import 'package:simple_live_tv_app/requests/http_client.dart';

/// LiveApi 工厂类
///
/// 根据配置返回 LocalLiveApi 或 RemoteLiveApi 实例。
/// - 服务端地址已配置 + 已启用 + 服务端可用 → RemoteLiveApi
/// - 否则 → LocalLiveApi
class LiveApiFactory {
  static LiveApiService? _instance;

  /// 获取当前 LiveApiService 实例
  ///
  /// 根据配置决定使用本地还是远程实现。
  /// 使用缓存实例，当配置变更时需调用 reset() 重置。
  static LiveApiService get instance {
    if (_instance != null) {
      return _instance!;
    }
    _instance = _createInstance();
    return _instance!;
  }

  /// 创建实例
  static LiveApiService _createInstance() {
    final settings = AppSettingsController.instance;
    final serverUrl = settings.serverUrl.value;
    final serverEnable = settings.serverEnable.value;

    // 服务端地址已配置 + 已启用 → RemoteLiveApi
    if (serverUrl.isNotEmpty && serverEnable) {
      return RemoteLiveApi(serverUrl);
    }

    // 否则 → LocalLiveApi
    return LocalLiveApi();
  }

  /// 重置实例
  ///
  /// 当服务端配置变更时调用，下次访问 instance 时会重新创建。
  static void reset() {
    _instance = null;
  }

  /// 检测服务端是否可用
  ///
  /// 通过 GET /health 接口验证服务端是否正常运行。
  static Future<bool> checkServerAvailable(String url) async {
    try {
      final result = await HttpClient.instance.getText('$url/health');
      return result == 'ok';
    } catch (e) {
      return false;
    }
  }
}
