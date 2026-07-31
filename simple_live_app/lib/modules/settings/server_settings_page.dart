import 'package:flutter/material.dart';
import 'package:flutter_smart_dialog/flutter_smart_dialog.dart';
import 'package:get/get.dart';
import 'package:remixicon/remixicon.dart';
import 'package:simple_live_app/app/app_style.dart';
import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/routes/route_path.dart';
import 'package:simple_live_app/widgets/settings/settings_card.dart';
import 'package:simple_live_app/widgets/settings/settings_switch.dart';

/// 服务端设置页面
///
/// 包含：
/// - 服务端地址输入框
/// - 服务端启用开关（控制直播接口是否走服务端）
/// - 测试连接
/// - 数据自动同步开关（独立于服务端启用，只要地址可用即可同步）
/// - 手动同步按钮
class ServerSettingsPage extends StatefulWidget {
  const ServerSettingsPage({super.key});

  @override
  State<ServerSettingsPage> createState() => _ServerSettingsPageState();
}

class _ServerSettingsPageState extends State<ServerSettingsPage> {
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
        title: const Text("服务端设置"),
      ),
      body: ListView(
        padding: AppStyle.edgeInsetsA12,
        children: [
          // 服务端地址配置
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
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          hintText: "如: http://192.168.1.100:8089",
                          prefixIcon: Icon(Icons.link),
                        ),
                        onChanged: (value) {
                          AppSettingsController.instance.setServerUrl(value);
                          // 地址变更时重置 LiveApiFactory
                          LiveApiFactory.reset();
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

          // 服务端启用开关
          Padding(
            padding: AppStyle.edgeInsetsA12.copyWith(top: 24),
            child: Text("接口设置", style: Get.textTheme.titleSmall),
          ),
          SettingsCard(
            child: Column(
              children: [
                Obx(() => SettingsSwitch(
                      title: "启用服务端接口",
                      subtitle: "开启后直播接口将通过服务端获取，否则使用本地直连",
                      value: AppSettingsController.instance.serverEnable.value,
                      onChanged: (value) {
                        AppSettingsController.instance.setServerEnable(value);
                        // 开关变更时重置 LiveApiFactory
                        LiveApiFactory.reset();
                      },
                    )),
              ],
            ),
          ),

          // 同步设置
          Padding(
            padding: AppStyle.edgeInsetsA12.copyWith(top: 24),
            child: Text("数据同步", style: Get.textTheme.titleSmall),
          ),
          SettingsCard(
            child: Column(
              children: [
                Obx(() => SettingsSwitch(
                      title: "数据自动同步",
                      subtitle: "独立于服务端启用，只要地址可用即可同步",
                      value: AppSettingsController
                          .instance.serverSyncEnable.value,
                      onChanged: (value) {
                        AppSettingsController.instance
                            .setServerSyncEnable(value);
                      },
                    )),
                AppStyle.divider,
                ListTile(
                  leading: const Icon(Remix.refresh_line),
                  title: const Text("手动同步"),
                  subtitle: const Text("前往服务端同步页面执行"),
                  trailing:
                      const Icon(Icons.chevron_right, color: Colors.grey),
                  onTap: () {
                    Get.toNamed(RoutePath.kServerSync);
                  },
                ),
              ],
            ),
          ),

          // 说明
          Padding(
            padding: AppStyle.edgeInsetsA12.copyWith(top: 24),
            child: Text(
              "说明：\n"
              "• 服务端启用：控制直播接口（分类、推荐、搜索、播放等）是否走服务端\n"
              "• 数据同步：独立于服务端启用开关，只要配置了服务端地址且可用即可同步\n"
              "• 弹幕始终由客户端直连各平台，不走服务端中转\n"
              "• Cookie 在客户端配置后自动上传到服务端",
              style: Get.textTheme.bodySmall?.copyWith(color: Colors.grey),
            ),
          ),
        ],
      ),
    );
  }

  /// 测试连接
  Future<void> _testConnection() async {
    final url = _urlController.text.trim();
    if (url.isEmpty) {
      SmartDialog.showToast("请输入服务端地址");
      return;
    }

    SmartDialog.showLoading(msg: "正在测试连接...");
    try {
      final available = await LiveApiFactory.checkServerAvailable(url);
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
}
