import 'package:flutter/material.dart';
import 'package:flutter_smart_dialog/flutter_smart_dialog.dart';
import 'package:get/get.dart';
import 'package:remixicon/remixicon.dart';
import 'package:simple_live_app/app/app_style.dart';
import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/app/utils.dart';
import 'package:simple_live_app/app/utils/embedded_server_url_resolver.dart';
import 'package:simple_live_app/app/utils/server_url_util.dart';
import 'package:simple_live_app/services/server_sync_service.dart';
import 'package:simple_live_app/widgets/settings/settings_card.dart';
import 'package:simple_live_app/widgets/settings/settings_switch.dart';

/// 服务端同步配置页面
///
/// 提供：
/// - 服务端地址输入
/// - 测试连接
/// - 数据自动同步开关
/// - 手动同步按钮
/// - 最后同步时间显示
class ServerSyncPage extends StatefulWidget {
  const ServerSyncPage({super.key});

  @override
  State<ServerSyncPage> createState() => _ServerSyncPageState();
}

class _ServerSyncPageState extends State<ServerSyncPage> {
  late TextEditingController _urlController;

  @override
  void initState() {
    super.initState();
    _urlController = TextEditingController(
      text: AppSettingsController.instance.serverUrl.value,
    );
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("服务端同步"),
      ),
      body: ListView(
        padding: AppStyle.edgeInsetsA12,
        children: [
          // 服务端地址
          Padding(
            padding: AppStyle.edgeInsetsA12.copyWith(top: 0),
            child: Text("服务端配置", style: Get.textTheme.titleSmall),
          ),
          SettingsCard(
            child: Column(
              children: [
                Padding(
                  padding: AppStyle.edgeInsetsA12,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text("服务端地址"),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _urlController,
                        autocorrect: false,
                        enableSuggestions: false,
                        keyboardType: TextInputType.url,
                        textCapitalization: TextCapitalization.none,
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          hintText: "如: http://192.168.1.100:8089",
                          prefixIcon: Icon(Icons.link),
                        ),
                        onChanged: (value) {
                          AppSettingsController.instance.setServerUrl(value);
                        },
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: _testConnection,
                              icon: const Icon(Icons.wifi_tethering),
                              label: const Text("测试连接"),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // 同步设置
          Padding(
            padding: AppStyle.edgeInsetsA12.copyWith(top: 24),
            child: Text("同步设置", style: Get.textTheme.titleSmall),
          ),
          SettingsCard(
            child: Column(
              children: [
                Obx(() => SettingsSwitch(
                      title: "数据自动同步",
                      subtitle: "每小时自动同步一次数据",
                      value: AppSettingsController
                          .instance.serverSyncEnable.value,
                      onChanged: (value) {
                        AppSettingsController.instance
                            .setServerSyncEnable(value);
                        if (value) {
                          ServerSyncService.instance.startAutoSync();
                        } else {
                          ServerSyncService.instance.stopAutoSync();
                        }
                      },
                    )),
                AppStyle.divider,
                ListTile(
                  leading: const Icon(Remix.refresh_line),
                  title: const Text("手动同步"),
                  subtitle: const Text("上传本地数据并获取合并结果"),
                  trailing: Obx(() => ServerSyncService.instance.syncing.value
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.chevron_right, color: Colors.grey)),
                  onTap: () {
                    if (!ServerSyncService.instance.syncing.value) {
                      ServerSyncService.instance.syncAll();
                    }
                  },
                ),
                AppStyle.divider,
                ListTile(
                  leading: const Icon(Remix.download_cloud_line),
                  title: const Text("仅拉取数据"),
                  subtitle: const Text("从服务端拉取数据到本地（不合并）"),
                  trailing: const Icon(Icons.chevron_right,
                      color: Colors.grey),
                  onTap: () {
                    ServerSyncService.instance.pullData();
                  },
                ),
              ],
            ),
          ),

          // 同步状态
          Padding(
            padding: AppStyle.edgeInsetsA12.copyWith(top: 24),
            child: Text("同步状态", style: Get.textTheme.titleSmall),
          ),
          SettingsCard(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Remix.time_line),
                  title: const Text("最后同步时间"),
                  trailing: Obx(() => Text(
                        AppSettingsController
                            .instance.serverLastSyncTime.value
                            .isEmpty
                            ? "未同步"
                            : AppSettingsController
                                .instance.serverLastSyncTime.value,
                        style: Get.textTheme.bodySmall,
                      )),
                ),
                AppStyle.divider,
                ListTile(
                  leading: const Icon(Remix.information_line),
                  title: const Text("同步状态"),
                  trailing: Obx(() => Text(
                        ServerSyncService.instance.syncStatus.value.isEmpty
                            ? "空闲"
                            : ServerSyncService.instance.syncStatus.value,
                        style: Get.textTheme.bodySmall,
                      )),
                ),
              ],
            ),
          ),

          // 说明
          Padding(
            padding: AppStyle.edgeInsetsA12.copyWith(top: 24),
            child: Text(
              "说明：\n"
              "1. 数据同步独立于'服务端启用'开关，只要配置了服务端地址且服务端可用即可同步\n"
              "2. 同步策略为并集+时间戳优先，客户端与服务端数据取并集\n"
              "3. Cookie 在客户端配置后自动上传到服务端，其他设备可同步获取\n"
              "4. 弹幕仍由客户端直连各平台，不走服务端中转",
              style: Get.textTheme.bodySmall?.copyWith(color: Colors.grey),
            ),
          ),
        ],
      ),
    );
  }

  /// 测试连接
  Future<void> _testConnection() async {
    final url = _normalizeUrl(_urlController.text);
    if (url.isEmpty) {
      SmartDialog.showToast("请输入服务端地址");
      return;
    }
    _urlController.text = url;

    // 本机地址 + 未指定端口 + 内嵌服务已启动：用实际 baseUrl（含端口）
    // 替换，避免 URL 端口缺失/不匹配导致测试失败。
    final resolved = await EmbeddedServerUrlResolver.resolve(url);
    if (resolved != _urlController.text) {
      _urlController.text = resolved;
    }
    final testUrl = _urlController.text;

    SmartDialog.showLoading(msg: "正在测试连接...");
    try {
      final available = await LiveApiFactory.checkServerAvailable(testUrl);
      SmartDialog.dismiss(status: SmartStatus.loading);
      if (available) {
        SmartDialog.showToast("连接成功");
      } else {
        SmartDialog.showToast("连接失败，请检查地址");
      }
    } catch (e) {
      SmartDialog.dismiss(status: SmartStatus.loading);
      SmartDialog.showToast("连接失败: $e");
    }
  }

  /// 规范化地址：修复 iOS 键盘吞冒号、补 scheme、去尾斜杠。
  /// 非法协议时回退到 trim，不阻断输入。
  String _normalizeUrl(String input) {
    try {
      return ServerUrlUtil.normalize(input);
    } catch (_) {
      return input.trim();
    }
  }
}
