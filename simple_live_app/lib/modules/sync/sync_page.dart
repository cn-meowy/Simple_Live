import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:remixicon/remixicon.dart';
import 'package:simple_live_app/app/app_style.dart';
import 'package:simple_live_app/routes/route_path.dart';
import 'package:simple_live_app/widgets/settings/settings_card.dart';

class SyncPage extends StatelessWidget {
  const SyncPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("数据同步"),
      ),
      body: ListView(
        padding: AppStyle.edgeInsetsA12,
        children: [
          Padding(
            padding: AppStyle.edgeInsetsA12.copyWith(top: 0),
            child: Text(
              "服务端同步",
              style: Get.textTheme.titleSmall,
            ),
          ),
          SettingsCard(
            child: Column(
              children: [
                ListTile(
                  title: const Text("服务端同步"),
                  leading: const Icon(Remix.server_line),
                  subtitle: const Text("通过自建服务端同步数据"),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Get.toNamed(RoutePath.kServerSync);
                  },
                ),
              ],
            ),
          ),
          Padding(
            padding: AppStyle.edgeInsetsA12.copyWith(top: 24),
            child: Text(
              "远程同步",
              style: Get.textTheme.titleSmall,
            ),
          ),
          SettingsCard(
            child: Column(
              children: [
                ListTile(
                  title: const Text("创建房间"),
                  leading: const Icon(Remix.home_wifi_line),
                  subtitle: const Text("其他设备可以通过房间号加入"),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Get.toNamed(RoutePath.kRemoteSyncRoom);
                  },
                ),
                AppStyle.divider,
                ListTile(
                  title: const Text("加入房间"),
                  leading: const Icon(Remix.add_circle_line),
                  subtitle: const Text("加入其他设备创建的房间"),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Get.toNamed(RoutePath.kRemoteSyncRoom);
                  },
                ),
                AppStyle.divider,
                ListTile(
                  title: const Text("WebDAV"),
                  leading: const Icon(Icons.cloud_upload_outlined),
                  subtitle: const Text("通过WebDAV同步数据"),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Get.toNamed(RoutePath.kRemoteSyncWebDav);
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
