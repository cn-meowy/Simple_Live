import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/app_style.dart';
import 'package:simple_live_app/app/services/sites_service.dart';
import 'package:simple_live_app/modules/category/category_controller.dart';
import 'package:simple_live_app/modules/category/category_list_view.dart';

class CategoryPage extends GetView<CategoryController> {
  const CategoryPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return GetBuilder<CategoryController>(
      builder: (_) =>
          controller.sites.isEmpty ? _buildEmpty(context) : _buildContent(),
    );
  }

  Widget _buildContent() {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 8,
        title: TabBar(
          controller: controller.tabController,
          padding: EdgeInsets.zero,
          tabAlignment: TabAlignment.center,
          tabs: controller.sites
              .map(
                (e) => Tab(
                  child: Row(
                    children: [
                      Image.asset(
                        e.logo,
                        width: 24,
                      ),
                      AppStyle.hGap8,
                      Text(e.name),
                    ],
                  ),
                ),
              )
              .toList(),
          labelPadding: AppStyle.edgeInsetsH20,
          isScrollable: true,
          indicatorSize: TabBarIndicatorSize.label,
        ),
      ),
      body: TabBarView(
        controller: controller.tabController,
        children: controller.sites
            .map(
              (e) => CategoryListView(
                controller.controllerFor(e.id),
                key: ValueKey(e.id),
              ),
            )
            .toList(),
      ),
    );
  }

  Widget _buildEmpty(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("分类"),
      ),
      body: RefreshIndicator(
        onRefresh: () => SitesService.instance.fetchRemoteSites(),
        child: ListView(
          children: const [
            SizedBox(height: 120),
            Icon(Icons.cloud_off, size: 64),
            SizedBox(height: 16),
            Center(
              child: Text("暂无可用平台，请前往设置配置服务端地址"),
            ),
          ],
        ),
      ),
    );
  }
}
