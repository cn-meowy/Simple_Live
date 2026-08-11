import 'package:flutter/material.dart';
import 'package:flutter_smart_dialog/flutter_smart_dialog.dart';
import 'package:get/get.dart';
import 'package:simple_live_tv_app/app/app_focus_node.dart';
import 'package:simple_live_tv_app/app/app_style.dart';
import 'package:simple_live_tv_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_tv_app/app/services/live_api_factory.dart';
import 'package:simple_live_tv_app/services/server_sync_service.dart';

class ServerSettingsController extends GetxController {
  var serverUrlFocusNode = AppFocusNode()..isFoucsed.value = true;
  var testConnectionFocusNode = AppFocusNode();
  var serverEnableFocusNode = AppFocusNode();
  var serverSyncEnableFocusNode = AppFocusNode();
  var syncNowFocusNode = AppFocusNode();
  var pullDataFocusNode = AppFocusNode();
  var lastSyncTimeFocusNode = AppFocusNode();

  /// 测试连接
  Future<void> testConnection() async {
    final url = AppSettingsController.instance.serverUrl.value;
    if (url.isEmpty) {
      SmartDialog.showToast("请先输入服务端地址");
      return;
    }
    SmartDialog.showLoading(msg: "正在测试连接...");
    try {
      final ok = await LiveApiFactory.checkServerAvailable(url);
      SmartDialog.dismiss(status: SmartStatus.loading);
      if (ok) {
        SmartDialog.showToast("连接成功");
      } else {
        SmartDialog.showToast("连接失败，请检查地址");
      }
    } catch (e) {
      SmartDialog.dismiss(status: SmartStatus.loading);
      SmartDialog.showToast("连接失败: $e");
    }
  }

  /// 设置服务端地址
  void setServerUrl(String url) {
    AppSettingsController.instance.setServerUrl(url.trim());
    LiveApiFactory.reset();
  }

  /// 弹出服务端地址输入对话框
  void showUrlInputDialog() {
    final textController = TextEditingController(
      text: AppSettingsController.instance.serverUrl.value,
    );
    Get.dialog(
      AlertDialog(
        backgroundColor: Get.theme.cardColor,
        surfaceTintColor: Colors.transparent,
        title: Text("服务端地址", style: AppStyle.titleStyleWhite),
        content: TextField(
          controller: textController,
          autofocus: true,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            hintText: "如: http://192.168.1.100:8089",
          ),
          style: AppStyle.textStyleWhite,
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: Text("取消", style: AppStyle.textStyleWhite),
          ),
          TextButton(
            onPressed: () {
              setServerUrl(textController.text);
              Get.back();
            },
            child: Text("确定", style: AppStyle.textStyleWhite),
          ),
        ],
      ),
    );
  }

  /// 切换服务端启用状态
  void setServerEnable(bool enable) {
    AppSettingsController.instance.setServerEnable(enable);
    LiveApiFactory.reset();
  }

  /// 切换自动同步状态
  void setServerSyncEnable(bool enable) {
    AppSettingsController.instance.setServerSyncEnable(enable);
    if (enable) {
      ServerSyncService.instance.startAutoSync();
    } else {
      ServerSyncService.instance.stopAutoSync();
    }
  }

  /// 手动同步
  Future<void> syncAll() async {
    await ServerSyncService.instance.syncAll();
  }

  /// 仅拉取数据
  Future<void> pullData() async {
    await ServerSyncService.instance.pullData();
  }
}
