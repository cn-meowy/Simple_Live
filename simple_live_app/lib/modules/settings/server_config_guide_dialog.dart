import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/routes/route_path.dart';

/// 未配置服务端地址时的引导弹窗
///
/// 不可被返回键 / 点击外部关闭，仅提供「前往设置」按钮。
/// 配合 [showServerConfigGuide] 的 while 循环实现「不可跳过」的引导。
class ServerConfigGuideDialog extends StatelessWidget {
  const ServerConfigGuideDialog({super.key});

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: AlertDialog(
        title: const Text("未配置服务端地址"),
        content: const Text(
          "Meow Live 需要连接自建服务端才能浏览直播内容，请在设置中配置服务端地址后再继续使用。",
        ),
        actions: [
          FilledButton(
            onPressed: () {
              Get.back<bool>(result: true);
            },
            child: const Text("前往设置"),
          ),
        ],
      ),
    );
  }
}

/// 展示未配置服务端地址的引导弹窗，直到用户成功配置地址才返回。
///
/// `serverUrl` 经持久化前会经 `ServerUrlUtil.normalize` 规范化，
/// 非空必含合法 http/https scheme，因此仅判空即可。
Future<void> showServerConfigGuide() async {
  while (AppSettingsController.instance.serverUrl.value.trim().isEmpty) {
    final goSettings = await Get.dialog<bool>(
      const ServerConfigGuideDialog(),
      barrierDismissible: false,
    );
    if (goSettings == true) {
      await Get.toNamed<void>(RoutePath.kSettingsServer);
    }
  }
}
