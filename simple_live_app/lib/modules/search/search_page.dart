import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/app_style.dart';
import 'package:simple_live_app/app/services/sites_service.dart';
import 'package:simple_live_app/modules/search/search_controller.dart';
import 'package:simple_live_app/modules/search/search_list_view.dart';

class SearchPage extends GetView<AppSearchController> {
  const SearchPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return GetBuilder<AppSearchController>(
      builder: (_) => controller.sites.isEmpty
          ? _buildEmpty(context)
          : _buildContent(),
    );
  }

  Widget _buildContent() {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: _buildSearchField(),
        bottom: TabBar(
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
        physics: const NeverScrollableScrollPhysics(),
        controller: controller.tabController,
        children: controller.sites
            .map((e) => SearchListView(
                  e.id,
                ))
            .toList(),
      ),
    );
  }

  Widget _buildEmpty(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: _buildSearchField(),
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

  Widget _buildSearchField() {
    return TextField(
      controller: controller.searchController,
      autofocus: true,
      decoration: InputDecoration(
        hintText: "搜点什么吧",
        border: OutlineInputBorder(
          borderRadius: AppStyle.radius24,
        ),
        contentPadding: AppStyle.edgeInsetsH12,
        prefixIcon: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              onPressed: Get.back,
              icon: const Icon(Icons.arrow_back),
            ),
            Obx(
              () => DropdownButton<int>(
                underline: const SizedBox(),
                items: const [
                  DropdownMenuItem(
                    value: 0,
                    child: Text("房间"),
                  ),
                  DropdownMenuItem(
                    value: 1,
                    child: Text("主播"),
                  ),
                ],
                value: controller.searchMode.value,
                onChanged: (e) {
                  controller.searchMode.value = e ?? 0;
                  controller.doSearch();
                },
              ),
            ),
            AppStyle.hGap8,
          ],
        ),
        suffixIcon: IconButton(
          onPressed: controller.doSearch,
          icon: const Icon(Icons.search),
        ),
      ),
      onSubmitted: (e) {
        controller.doSearch();
      },
    );
  }
}
