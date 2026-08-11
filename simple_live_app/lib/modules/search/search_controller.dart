import 'dart:async';

import 'package:flutter/material.dart';

import 'package:get/get.dart';
import 'package:simple_live_app/app/services/sites_service.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_app/modules/search/search_list_controller.dart';

class AppSearchController extends GetxController
    with GetTickerProviderStateMixin {
  /// 当前 Tab 站点列表（快照，避免迭代中被并发修改）
  List<Site> sites = <Site>[];

  late TabController tabController;
  int index = 0;

  var searchMode = 0.obs;

  AppSearchController() {
    tabController = TabController(length: 0, vsync: this);
  }

  StreamSubscription<dynamic>? streamSubscription;
  Worker? _sitesWorker;

  TextEditingController searchController = TextEditingController();

  @override
  void onInit() {
    _sitesWorker =
        ever(SitesService.instance.remoteSites, (_) => _rebuildTabs());
    _rebuildTabs();

    super.onInit();
  }

  /// 重建 Tab：清理旧 ListController，注册新的，重建 TabController 并重挂动画监听
  void _rebuildTabs() {
    final newSites = Sites.supportSites;
    final newIds = newSites.map((e) => e.id).toSet();
    final oldIds = sites.map((e) => e.id).toSet();

    for (final id in oldIds.where((id) => !newIds.contains(id))) {
      if (Get.isRegistered<SearchListController>(tag: id)) {
        Get.delete<SearchListController>(tag: id);
      }
    }

    for (final site in newSites) {
      if (!Get.isRegistered<SearchListController>(tag: site.id)) {
        Get.put(
          SearchListController(site),
          tag: site.id,
        );
      }
    }

    final oldIndex = tabController.index;
    tabController.dispose();
    tabController = TabController(length: newSites.length, vsync: this);
    if (newSites.isNotEmpty) {
      tabController.index = oldIndex.clamp(0, newSites.length - 1);
    }
    _attachAnimationListener();

    sites = newSites;
    index = tabController.index;
    update();
  }

  void _attachAnimationListener() {
    tabController.animation?.removeListener(_onTabAnimation);
    tabController.animation?.addListener(_onTabAnimation);
  }

  void _onTabAnimation() {
    if (sites.isEmpty) return;
    final currentIndex = (tabController.animation?.value ?? 0).round();
    if (index == currentIndex) {
      return;
    }
    if (currentIndex < 0 || currentIndex >= sites.length) {
      return;
    }

    index = currentIndex;

    if (!Get.isRegistered<SearchListController>(tag: sites[index].id)) return;
    var controller =
        Get.find<SearchListController>(tag: sites[index].id);

    if (controller.list.isEmpty &&
        !controller.pageEmpty.value &&
        controller.keyword.isNotEmpty) {
      controller.refreshData();
    }
  }

  void doSearch() {
    if (searchController.text.isEmpty) {
      return;
    }
    if (sites.isEmpty) return;
    for (var site in sites) {
      if (!Get.isRegistered<SearchListController>(tag: site.id)) continue;
      var controller = Get.find<SearchListController>(tag: site.id);
      controller.clear();
      controller.keyword = searchController.text;
      controller.searchMode.value = searchMode.value;
    }
    if (index < 0 || index >= sites.length) return;
    if (!Get.isRegistered<SearchListController>(tag: sites[index].id)) return;
    var controller = Get.find<SearchListController>(tag: sites[index].id);
    controller.refreshData();
  }

  @override
  void onClose() {
    _sitesWorker?.dispose();
    streamSubscription?.cancel();
    tabController.animation?.removeListener(_onTabAnimation);
    tabController.dispose();
    super.onClose();
  }
}
