import 'package:flutter/material.dart';
import 'dart:async';
import 'package:flutter_smart_dialog/flutter_smart_dialog.dart';
import 'package:get/get.dart';
import 'package:remixicon/remixicon.dart';
import 'package:simple_live_app/app/app_style.dart';
import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/app/services/sites_service.dart';
import 'package:simple_live_app/app/utils/embedded_server_url_resolver.dart';
import 'package:simple_live_app/app/utils/server_url_util.dart';
import 'package:simple_live_app/routes/route_path.dart';
import 'package:simple_live_app/widgets/settings/settings_card.dart';
import 'package:simple_live_app/widgets/settings/settings_switch.dart';

/// 服务端设置页面
///
/// 包含：
/// - 服务端地址输入框（本机地址自动启动内嵌服务）
/// - 测试连接
/// - 数据自动同步开关（只要地址可用即可同步）
/// - 手动同步按钮
class ServerSettingsPage extends StatefulWidget {
  const ServerSettingsPage({super.key});

  @override
  State<ServerSettingsPage> createState() => _ServerSettingsPageState();
}

class _ServerSettingsPageState extends State<ServerSettingsPage> {
  late TextEditingController _urlController;
  late FocusNode _urlFocusNode;

  @override
  void initState() {
    super.initState();
    _urlController = TextEditingController(
      text: AppSettingsController.instance.serverUrl.value,
    );
    // 失焦时统一持久化 + 重置 API 实例 + 重新拉取站点列表，刷新首页/分类/搜索 Tab。
    // 不在 onChanged 中触发，避免每次按键都请求服务端。
    _urlFocusNode = FocusNode();
    _urlFocusNode.addListener(_onUrlFocusChanged);
  }

  @override
  void dispose() {
    _urlFocusNode.removeListener(_onUrlFocusChanged);
    _urlFocusNode.dispose();
    _urlController.dispose();
    super.dispose();
  }

  /// 输入框失焦时：地址变更则持久化、重置 API 实例
  ///
  /// 站点列表的重新拉取由 AppSettingsController 中 ever(serverUrl) 监听器
  /// 在 setServerUrl() 触发时统一处理，避免与本方法双重调用。
  void _onUrlFocusChanged() {
    if (_urlFocusNode.hasFocus) return;
    final value = _normalizeUrl(_urlController.text);
    if (value == AppSettingsController.instance.serverUrl.value) return;
    _urlController.text = value;
    AppSettingsController.instance.setServerUrl(value);
    // 地址变更时重置 LiveApiFactory，下次访问会按需启停内嵌服务
    unawaited(LiveApiFactory.reset());
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
                        focusNode: _urlFocusNode,
                        autocorrect: false,
                        enableSuggestions: false,
                        keyboardType: TextInputType.url,
                        textCapitalization: TextCapitalization.none,
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          hintText: "如: http://192.168.1.100:8089",
                          prefixIcon: Icon(Icons.link),
                        ),
                      ),
                      Obx(() {
                        final status = AppSettingsController
                            .instance.embeddedServerStatus.value;
                        final text = switch (status) {
                          'running' => '本地服务已启动（仅本机或同局域网可访问）',
                          'remote:checking' => '正在检测远端服务...',
                          'remote:ok' => '远端服务已连接',
                          'remote:fail' => '远端服务连接失败，请检查地址',
                          'disabled' => '未配置服务端地址',
                          _ => status.startsWith('error:')
                              ? '启动失败：${status.substring(6)}'
                              : status,
                        };
                        final color = switch (status) {
                          'running' || 'remote:ok' => Colors.green,
                          'remote:checking' => Colors.orange,
                          'remote:fail' => Colors.red,
                          _ => status.startsWith('error:')
                              ? Colors.red
                              : Colors.grey,
                        };
                        return Padding(
                          padding: const EdgeInsets.only(
                              top: 8, left: 4, right: 4),
                          child: Text(
                            text,
                            style: TextStyle(color: color, fontSize: 12),
                          ),
                        );
                      }),
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
              "• 地址需包含 http:// 前缀，否则会被默认补为 https:// 导致无法连接\n"
              "• 数据同步：只要配置了服务端地址且可用即可同步\n"
              "• 远端地址启用后会自动检测可用性并显示状态\n",
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
        // 测试成功：将地址持久化并刷新站点列表，使首页/分类/搜索 Tab 即时更新。
        // 用户可能未离开输入框（未触发失焦），这里兜底保证地址生效。
        if (testUrl != AppSettingsController.instance.serverUrl.value) {
          AppSettingsController.instance.setServerUrl(testUrl);
          await LiveApiFactory.reset();
        }
        SitesService.instance.fetchRemoteSites();
      } else {
        SmartDialog.showToast("连接失败，请检查地址");
      }
    } catch (e) {
      SmartDialog.dismiss(status: SmartStatus.loading);
      SmartDialog.showToast("连接失败: $e");
    }
  }
}
