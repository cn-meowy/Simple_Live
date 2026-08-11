import 'dart:async';

import 'package:flutter/widgets.dart';

import 'package:simple_live_app/app/log.dart';

import 'package:flutter_easyrefresh/easy_refresh.dart';
import 'package:flutter_smart_dialog/flutter_smart_dialog.dart';
import 'package:get/get.dart';

class BaseController extends GetxController {
  /// 加载中，更新页面
  var pageLoadding = false.obs;

  /// 加载中,不会更新页面
  var loadding = false;

  /// 空白页面
  var pageEmpty = false.obs;

  /// 页面错误
  var pageError = false.obs;

  /// 未登录
  var notLogin = false.obs;

  /// 错误信息
  var errorMsg = "".obs;

  /// 显示错误
  /// * [msg] 错误信息
  /// * [showPageError] 显示页面错误
  /// * 只在第一页加载错误时showPageError=true，后续页加载错误时使用Toast弹出通知
  void handleError(Object exception, {bool showPageError = false}) {
    Log.e(exception.toString(), StackTrace.current);
    var msg = exceptionToString(exception);

    if (showPageError) {
      pageError.value = true;
      errorMsg.value = msg;
    } else {
      SmartDialog.showToast(exceptionToString(msg));
    }
  }

  String exceptionToString(Object exception) {
    return exception.toString().replaceAll("Exception:", "");
  }

  void onLogin() {}
  void onLogout() {}
}

class BasePageController<T> extends BaseController {
  final ScrollController scrollController = ScrollController();
  final EasyRefreshController easyRefreshController = EasyRefreshController();
  int currentPage = 1;
  int count = 0;
  int maxPage = 0;
  int pageSize = 24;
  var canLoadMore = false.obs;
  var list = <T>[].obs;

  int _requestSequence = 0;
  int _activeRequest = 0;
  bool _disposed = false;

  Future refreshData() async {
    final request = ++_requestSequence;
    _activeRequest = request;
    currentPage = 1;
    list.value = [];
    await _loadData(request, force: true);
  }

  Future loadData() async {
    if (loadding) return;
    final request = ++_requestSequence;
    _activeRequest = request;
    await _loadData(request, force: false);
  }

  Future<void> _loadData(int request, {required bool force}) async {
    if (!force && loadding) return;
    loadding = true;
    pageError.value = false;
    pageEmpty.value = false;
    notLogin.value = false;
    pageLoadding.value = currentPage == 1;

    try {
      final page = currentPage;
      final result = await getData(page, pageSize);
      if (request != _activeRequest) return;

      if (result.isNotEmpty) {
        currentPage = page + 1;
        canLoadMore.value = true;
        pageEmpty.value = false;
      } else {
        canLoadMore.value = false;
        if (page == 1) pageEmpty.value = true;
      }

      if (page == 1) {
        list.value = result;
      } else {
        list.addAll(result);
      }
    } catch (e) {
      if (request == _activeRequest) {
        handleError(e, showPageError: currentPage == 1);
      }
    } finally {
      if (request == _activeRequest) {
        loadding = false;
        pageLoadding.value = false;
      }
    }
  }

  Future<List<T>> getData(int page, int pageSize) async {
    return [];
  }

  void scrollToTopOrRefresh() {
    if (scrollController.offset > 0) {
      scrollController.animateTo(
        0,
        duration: const Duration(milliseconds: 200),
        curve: Curves.linear,
      );
    } else {
      easyRefreshController.callRefresh();
    }
  }

  void disposePageController() {
    if (_disposed) return;
    _disposed = true;
    easyRefreshController.dispose();
    scrollController.dispose();
  }
}
