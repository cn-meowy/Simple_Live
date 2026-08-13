import 'package:flutter/material.dart';
import 'package:flutter_smart_dialog/flutter_smart_dialog.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/app_style.dart';
import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/app/log.dart';
import 'package:simple_live_app/requests/http_client.dart';

/// 通用 Cookie 输入控制器
///
/// 通过服务端 `PUT /api/v1/cookie/:siteId` 写入 Cookie。
class GenericCookieLoginController extends GetxController {
  GenericCookieLoginController({required this.siteId});

  final String siteId;

  final cookieController = TextEditingController();
  var saving = false.obs;

  @override
  void onClose() {
    cookieController.dispose();
    super.onClose();
  }

  Future<void> save() async {
    final value = cookieController.text.trim();
    if (value.isEmpty) {
      SmartDialog.showToast("Cookie 不能为空");
      return;
    }
    saving.value = true;
    try {
      final serverUrl = AppSettingsController.instance.serverUrl.value;
      if (serverUrl.isEmpty) {
        SmartDialog.showToast("请先在设置中配置服务端地址");
        return;
      }
      await HttpClient.instance.putJson(
        '$serverUrl/api/v1/cookie/$siteId',
        data: {'cookie': value},
      );
      SmartDialog.showToast("Cookie 已保存");
      Get.back<bool>(result: true);
    } catch (e) {
      Log.logPrint(e);
      SmartDialog.showToast("保存失败：$e");
    } finally {
      saving.value = false;
    }
  }
}

/// 通用 Cookie 输入页
class GenericCookieLoginPage extends GetView<GenericCookieLoginController> {
  const GenericCookieLoginPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("${controller.siteId} - Cookie 配置")),
      body: Padding(
        padding: AppStyle.edgeInsetsA16,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              "手动输入 Cookie 字符串（key=value; key=value...）",
              style: Get.textTheme.bodySmall,
            ),
            AppStyle.vGap8,
            Expanded(
              child: TextField(
                controller: controller.cookieController,
                maxLines: null,
                expands: true,
                keyboardType: TextInputType.multiline,
                textAlignVertical: TextAlignVertical.top,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: "请粘贴 Cookie 内容",
                ),
              ),
            ),
            AppStyle.vGap8,
            Obx(
              () => FilledButton(
                onPressed: controller.saving.value ? null : controller.save,
                child: controller.saving.value
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text("保存"),
              ),
            ),
          ],
        ),
      ),
    );
  }
}