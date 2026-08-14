import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:hive/hive.dart';
import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/app/services/embedded_live_server.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/app/services/remote_live_api.dart';
import 'package:simple_live_app/services/local_storage_service.dart';

/// LiveApiFactory 对非本机地址的可用性检测行为校验。
///
/// 仅验证「创建实例后 status 立即变为 `remote:checking`」，
/// 这是同步可观察的契约。异步检测结果（remote:ok / remote:fail）依赖
/// 网络真实时序（HttpClient 20s 超时），不适合单元测试场景。
///
/// 端到端测试可通过手动触发「设置远端地址 -> 观察 status 变化」验证。
void main() {
  setUpAll(() async {
    Hive.init('/tmp/dart_simple_live_test_${DateTime.now().millisecondsSinceEpoch}');
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

  test('非本机地址：创建实例后 status 立即变为 remote:checking', () async {
    AppSettingsController.instance.serverUrl.value =
        'http://192.0.2.1:8089'; // RFC 5737 TEST-NET-1，文档保留 IP

    final api = await LiveApiFactory.instanceAsync;
    expect(api, isA<RemoteLiveApi>());

    // 创建实例返回后 status 已被同步设为 remote:checking
    // （不阻塞后续 API 调用的设计契约）
    expect(
      AppSettingsController.instance.embeddedServerStatus.value,
      'remote:checking',
    );
  });
}