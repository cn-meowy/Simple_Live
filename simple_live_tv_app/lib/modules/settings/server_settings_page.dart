import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:get/get.dart';
import 'package:simple_live_tv_app/app/app_focus_node.dart';
import 'package:simple_live_tv_app/app/app_style.dart';
import 'package:simple_live_tv_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_tv_app/modules/settings/server_settings_controller.dart';
import 'package:simple_live_tv_app/widgets/app_scaffold.dart';
import 'package:simple_live_tv_app/widgets/button/highlight_button.dart';
import 'package:simple_live_tv_app/widgets/button/highlight_list_tile.dart';
import 'package:simple_live_tv_app/widgets/settings_item_widget.dart';

class ServerSettingsPage extends GetView<ServerSettingsController> {
  const ServerSettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      child: Column(
        children: [
          AppStyle.vGap32,
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              AppStyle.hGap48,
              HighlightButton(
                focusNode: AppFocusNode(),
                iconData: Icons.arrow_back,
                text: "返回",
                onTap: () {
                  Get.back();
                },
              ),
              AppStyle.hGap32,
              Text(
                "服务端设置",
                style: AppStyle.titleStyleWhite.copyWith(
                  fontSize: 36.w,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Spacer(),
            ],
          ),
          AppStyle.vGap48,
          Expanded(
            child: SizedBox(
              width: 800.w,
              child: ListView(
                padding: AppStyle.edgeInsetsA48,
                children: [
                  // 服务端地址
                  Obx(
                    () => HighlightListTile(
                      focusNode: controller.serverUrlFocusNode,
                      autofocus:
                          controller.serverUrlFocusNode.isFoucsed.value,
                      title: "服务端地址",
                      subtitle: AppSettingsController
                              .instance.serverUrl.value.isEmpty
                          ? "未配置，点击设置"
                          : AppSettingsController.instance.serverUrl.value,
                      leading: const Icon(Icons.link),
                      onTap: () {
                        controller.showUrlInputDialog();
                      },
                    ),
                  ),
                  AppStyle.vGap24,
                  // 测试连接
                  HighlightButton(
                    focusNode: controller.testConnectionFocusNode,
                    iconData: Icons.wifi_tethering,
                    text: "测试连接",
                    onTap: controller.testConnection,
                  ),
                  AppStyle.vGap32,

                  // 启用服务端接口
                  Obx(
                    () => SettingsItemWidget(
                      foucsNode: controller.serverEnableFocusNode,
                      autofocus:
                          controller.serverEnableFocusNode.isFoucsed.value,
                      title: "启用服务端接口",
                      items: const {
                        0: "关",
                        1: "开",
                      },
                      value: AppSettingsController
                              .instance.serverEnable.value
                          ? 1
                          : 0,
                      onChanged: (e) {
                        controller.setServerEnable(e == 1);
                      },
                    ),
                  ),
                  AppStyle.vGap24,

                  // 数据自动同步
                  Obx(
                    () => SettingsItemWidget(
                      foucsNode: controller.serverSyncEnableFocusNode,
                      autofocus:
                          controller.serverSyncEnableFocusNode.isFoucsed.value,
                      title: "数据自动同步",
                      items: const {
                        0: "关",
                        1: "开",
                      },
                      value: AppSettingsController
                              .instance.serverSyncEnable.value
                          ? 1
                          : 0,
                      onChanged: (e) {
                        controller.setServerSyncEnable(e == 1);
                      },
                    ),
                  ),
                  AppStyle.vGap32,

                  // 手动同步
                  HighlightButton(
                    focusNode: controller.syncNowFocusNode,
                    iconData: Icons.sync,
                    text: "手动同步",
                    onTap: controller.syncAll,
                  ),
                  AppStyle.vGap24,

                  // 仅拉取数据
                  HighlightButton(
                    focusNode: controller.pullDataFocusNode,
                    iconData: Icons.download,
                    text: "仅拉取数据",
                    onTap: controller.pullData,
                  ),
                  AppStyle.vGap32,

                  // 最后同步时间
                  Obx(
                    () => HighlightListTile(
                      focusNode: controller.lastSyncTimeFocusNode,
                      title: "最后同步时间",
                      subtitle: AppSettingsController
                              .instance.serverLastSyncTime.value.isEmpty
                          ? "从未同步"
                          : AppSettingsController
                              .instance.serverLastSyncTime.value,
                      onTap: () {},
                    ),
                  ),
                  AppStyle.vGap32,

                  // 说明文字
                  Padding(
                    padding: AppStyle.edgeInsetsH24,
                    child: Text(
                      "说明：\n"
                      "• 启用服务端接口后，分类/推荐/搜索/播放等走服务端\n"
                      "• 数据同步独立于接口开关，只要地址可用即可同步\n"
                      "• 弹幕始终由客户端直连各平台，不走服务端中转\n"
                      "• Cookie 在客户端配置后自动上传到服务端",
                      style: AppStyle.subTextStyleWhite,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
