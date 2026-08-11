import 'dart:async';

import 'package:flutter/material.dart';

import 'package:get/get.dart';
import 'package:simple_live_app/app/event_bus.dart';
import 'package:simple_live_app/app/services/sites_service.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_app/modules/home/home_list_controller.dart';
import 'package:simple_live_app/routes/route_path.dart';

class HomeController extends GetxController with GetTickerProviderStateMixin {
  List<Site> sites = <Site>[];

  late TabController tabController;

  final Map<String, HomeListController> _listControllers = {};

  bool _closed = false;
  int _rebuildGeneration = 0;

  HomeController() {
    tabController = TabController(length: 0, vsync: this);
  }

  StreamSubscription<dynamic>? streamSubscription;
  Worker? _sitesWorker;

  HomeListController controllerFor(String siteId) {
    return _listControllers[siteId]!;
  }

  @override
  void onInit() {
    streamSubscription = EventBus.instance.listen(
      EventBus.kBottomNavigationBarClicked,
      (index) {
        if (index == 0) {
          refreshOrScrollTop();
        }
      },
    );
    _sitesWorker = ever(
      SitesService.instance.remoteSites,
      (_) =>
          WidgetsBinding.instance.addPostFrameCallback((_) => _rebuildTabs()),
    );
    _rebuildTabs();

    super.onInit();
  }

  void _rebuildTabs() {
    if (_closed) return;
    final generation = ++_rebuildGeneration;
    final newSites = Sites.supportSites;

    final newIds = newSites.map((e) => e.id).toSet();
    final removedIds =
        _listControllers.keys.where((id) => !newIds.contains(id)).toList();

    for (final site in newSites) {
      _listControllers.putIfAbsent(site.id, () => HomeListController(site));
    }

    final oldIds = sites.map((e) => e.id).toList();
    final newIdList = newSites.map((e) => e.id).toList();
    final structureChanged =
        oldIds.length != newIdList.length || !_listEquals(oldIds, newIdList);

    if (structureChanged) {
      final oldIndex = tabController.index;
      tabController.dispose();
      tabController = TabController(length: newSites.length, vsync: this);
      if (newSites.isNotEmpty) {
        tabController.index = oldIndex.clamp(0, newSites.length - 1);
      }
    }

    sites = newSites;
    update();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_closed || generation != _rebuildGeneration) return;
      for (final site in sites) {
        final c = _listControllers[site.id];
        if (c != null) {
          c.refreshData();
        }
      }
      for (final id in removedIds) {
        final c = _listControllers.remove(id);
        c?.disposePageController();
      }
    });
  }

  bool _listEquals(List<String> a, List<String> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  void refreshOrScrollTop() {
    if (sites.isEmpty) return;
    final tabIndex = tabController.index;
    if (tabIndex < 0 || tabIndex >= sites.length) return;
    final controller = _listControllers[sites[tabIndex].id];
    if (controller == null) return;
    controller.scrollToTopOrRefresh();
  }

  void toSearch() {
    Get.toNamed(RoutePath.kSearch);
  }

  @override
  void onClose() {
    _closed = true;
    _rebuildGeneration++;
    for (final c in _listControllers.values) {
      c.disposePageController();
    }
    _listControllers.clear();
    _sitesWorker?.dispose();
    streamSubscription?.cancel();
    tabController.dispose();
    super.onClose();
  }
}
