import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:hive/hive.dart';
import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/app/services/embedded_live_server.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/requests/http_client.dart';
import 'package:simple_live_app/services/local_storage_service.dart';

/// LiveApiFactory.resolveBaseUrl() 的回归测试：
///
/// - 未配置 serverUrl 时返回空字符串；
/// - 本机模式（无端口）返回 `http://127.0.0.1:<实际端口>`，`/health` 200 ok；
/// - 远端模式返回原始 serverUrl（行为不变）。
///
/// 复现根因 A：账号/同步接口此前绕过工厂直接读 serverUrl.value，无端口，
/// 内置服务启动失败 / 请求打到 80。本测试确保 resolveBaseUrl 携带实际端口。
void main() {
  setUpAll(() async {
    Hive.init('/tmp/dart_simple_live_resolve_base_url_test_${DateTime.now().millisecondsSinceEpoch}');
    if (!Get.isRegistered<LocalStorageService>()) {
      final svc = Get.put(LocalStorageService());
      await svc.init();
    }
    if (!Get.isRegistered<AppSettingsController>()) {
      Get.put(AppSettingsController());
    }
  });

  setUp(() {
    LiveApiFactory.reset();
    LiveApiFactory.restoreCreateInstance();
    AppSettingsController.instance.serverUrl.value = '';
    AppSettingsController.instance.embeddedServerStatus.value = 'disabled';
  });

  tearDown(() async {
    LiveApiFactory.reset();
    LiveApiFactory.restoreCreateInstance();
    AppSettingsController.instance.serverUrl.value = '';
    AppSettingsController.instance.embeddedServerStatus.value = 'disabled';
    await EmbeddedLiveServer.instance.stop();
  });

  test('serverUrl 为空时 resolveBaseUrl 返回空字符串', () async {
    AppSettingsController.instance.serverUrl.value = '';
    final base = await LiveApiFactory.resolveBaseUrl();
    expect(base, '');
  });

  test('本机地址无端口：resolveBaseUrl 返回带端口的 baseUrl 且 /health 可达',
      () async {
    AppSettingsController.instance.serverUrl.value = 'http://127.0.0.1';
    // serverPort=0 让 EmbeddedLiveServer 系统分配端口，避免测试间冲突
    AppSettingsController.instance.serverPort.value = 0;

    final base = await LiveApiFactory.resolveBaseUrl();

    expect(base, isNotEmpty);
    expect(base, startsWith('http://127.0.0.1:'));
    // 端口 > 0
    final portStr = base.substring('http://127.0.0.1:'.length);
    expect(int.tryParse(portStr), isNotNull);
    expect(int.parse(portStr) > 0, isTrue,
        reason: '内置服务应绑定到非零端口');

    // 实际请求 /health 验证端口有效（核心回归点）
    final health = await HttpClient.instance.getText('$base/health');
    expect(health, 'ok');
  });

  test('远端地址：resolveBaseUrl 返回原始 serverUrl（端口由地址指定）',
      () async {
    AppSettingsController.instance.serverUrl.value = 'http://192.0.2.1:8089';
    final base = await LiveApiFactory.resolveBaseUrl();
    expect(base, 'http://192.0.2.1:8089');
  });
}
