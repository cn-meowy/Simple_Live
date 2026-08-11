import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/app_style.dart';
import 'package:simple_live_app/app/constant.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_app/modules/settings/indexed_settings/indexed_settings_controller.dart';
import 'package:simple_live_app/widgets/settings/settings_card.dart';

class IndexedSettingsPage extends GetView<IndexedSettingsController> {
  const IndexedSettingsPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("主页设置"),
      ),
      body: ListView(
        padding: AppStyle.edgeInsetsA12,
        children: [
          Padding(
            padding: AppStyle.edgeInsetsA12.copyWith(top: 0),
            child: Text(
              "主页排序 (长按拖动排序，重启后生效)",
              style: Get.textTheme.titleSmall,
            ),
          ),
          SettingsCard(
            child: Obx(
              () => ReorderableListView(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                onReorder: controller.updateHomeSort,
                children: controller.homeSort.map(
                  (key) {
                    var e = Constant.allHomePages[key]!;
                    return ListTile(
                      key: ValueKey(e.title),
                      title: Text(e.title),
                      visualDensity: VisualDensity.compact,
                      leading: Icon(e.iconData),
                      trailing: const Icon(Icons.drag_handle),
                    );
                  },
                ).toList(),
              ),
            ),
          ),
          Padding(
            padding: AppStyle.edgeInsetsA12.copyWith(top: 24),
            child: Text(
              "平台排序 (长按拖动排序，重启后生效)",
              style: Get.textTheme.titleSmall,
            ),
          ),
          SettingsCard(
            child: Obx(
              () {
                // 平台排序由后端 remoteSites 驱动：siteSort 经 _syncSiteSort
                // 已裁剪为仅后端存在的 id，此处按 siteSort 顺序映射 Site。
                final siteById = {
                  for (final s in Sites.supportSites) s.id: s,
                };
                final sites = controller.siteSort
                    .where((key) => siteById.containsKey(key))
                    .map((key) => siteById[key]!)
                    .toList();
                if (sites.isEmpty) {
                  return Padding(
                    padding: AppStyle.edgeInsetsA16,
                    child: const Text("暂无可用平台，请前往设置配置服务端地址"),
                  );
                }
                return ReorderableListView(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  onReorder: controller.updateSiteSort,
                  children: sites
                      .map(
                        (e) => ListTile(
                          key: ValueKey(e.id),
                          visualDensity: VisualDensity.compact,
                          title: Text(e.name),
                          leading: Image.asset(
                            e.logo,
                            width: 24,
                            height: 24,
                          ),
                          trailing: const Icon(Icons.drag_handle),
                        ),
                      )
                      .toList(),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
