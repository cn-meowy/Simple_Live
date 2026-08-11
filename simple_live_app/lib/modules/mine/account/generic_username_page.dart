import 'package:flutter/material.dart';
import 'package:flutter_smart_dialog/flutter_smart_dialog.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/app_style.dart';
import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/app/log.dart';
import 'package:simple_live_app/models/account/site_account_descriptor.dart';
import 'package:simple_live_app/requests/http_client.dart';

/// 通用用户名输入控制器
///
/// 通过服务端 `GET/PUT/DELETE /api/v1/sites/:siteId/account/username` 读写用户名。
class GenericUsernameController extends GetxController {
  GenericUsernameController({
    required this.siteId,
    required this.descriptor,
  });

  final String siteId;
  final SiteAccountDescriptor descriptor;

  final usernameController = TextEditingController();
  var loading = true.obs;
  var saving = false.obs;

  String get _serverUrl => AppSettingsController.instance.serverUrl.value;

  @override
  void onInit() {
    super.onInit();
    _load();
  }

  @override
  void onClose() {
    usernameController.dispose();
    super.onClose();
  }

  Future<void> _load() async {
    loading.value = true;
    try {
      final result = await HttpClient.instance.getJson(
        '$_serverUrl/api/v1/sites/$siteId/account/username',
      );
      final value = result['data']['username'] as String? ?? '';
      if (value.isNotEmpty) {
        usernameController.text = value;
      }
    } catch (e) {
      Log.logPrint(e);
    } finally {
      loading.value = false;
    }
  }

  Future<void> save() async {
    final value = usernameController.text.trim();
    if (value.isEmpty) {
      SmartDialog.showToast("用户名不能为空");
      return;
    }
    saving.value = true;
    try {
      await HttpClient.instance.postJson(
        '$_serverUrl/api/v1/sites/$siteId/account/username',
        data: {'username': value},
      );
      SmartDialog.showToast("已保存");
      Get.back<bool>(result: true);
    } catch (e) {
      Log.logPrint(e);
      SmartDialog.showToast("保存失败：$e");
    } finally {
      saving.value = false;
    }
  }

  Future<void> clear() async {
    saving.value = true;
    try {
      await HttpClient.instance.dio.delete(
        '$_serverUrl/api/v1/sites/$siteId/account/username',
      );
      usernameController.clear();
      SmartDialog.showToast("已清除");
    } catch (e) {
      Log.logPrint(e);
      SmartDialog.showToast("清除失败：$e");
    } finally {
      saving.value = false;
    }
  }
}

/// 通用用户名输入页
class GenericUsernamePage extends GetView<GenericUsernameController> {
  const GenericUsernamePage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(controller.descriptor.label)),
      body: Padding(
        padding: AppStyle.edgeInsetsA16,
        child: Obx(
          () => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (controller.loading.value)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator()),
                )
              else ...[
                Text(
                  controller.descriptor.hint,
                  style: Get.textTheme.bodySmall,
                ),
                AppStyle.vGap12,
                TextField(
                  controller: controller.usernameController,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    labelText: "用户名",
                  ),
                ),
                AppStyle.vGap12,
                FilledButton(
                  onPressed: controller.saving.value ? null : controller.save,
                  child: controller.saving.value
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text("保存"),
                ),
                AppStyle.vGap8,
                if (controller.usernameController.text.isNotEmpty)
                  TextButton(
                    onPressed: controller.saving.value ? null : controller.clear,
                    child: const Text("清除"),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}