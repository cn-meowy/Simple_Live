import 'dart:io';

import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_smart_dialog/flutter_smart_dialog.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/constant.dart';
import 'package:simple_live_app/app/log.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_app/models/account/bilibili_user_info_page.dart';
import 'package:simple_live_app/requests/http_client.dart';
import 'package:simple_live_app/services/local_storage_service.dart';
import 'package:simple_live_app/core/simple_live_core.dart';

class BiliBiliAccountService extends GetxService {
  static BiliBiliAccountService get instance =>
      Get.find<BiliBiliAccountService>();

  var logined = false.obs;

  var cookie = "";
  var uid = 0;
  var name = "未登录".obs;

  @override
  void onInit() {
    cookie = LocalStorageService.instance
        .getValue(LocalStorageService.kBilibiliCookie, "");
    logined.value = cookie.isNotEmpty;
    loadUserInfo();
    // 从服务端拉取 Cookie（如果本地没有的话）
    _syncCookieFromServer();
    super.onInit();
  }

  Future loadUserInfo() async {
    if (cookie.isEmpty) {
      return;
    }
    try {
      var result = await HttpClient.instance.getJson(
        "https://api.bilibili.com/x/member/web/account",
        header: {
          "Cookie": cookie,
        },
      );
      if (result["code"] == 0) {
        var info = BiliBiliUserInfoModel.fromJson(result["data"]);
        name.value = info.uname ?? "未登录";
        uid = info.mid ?? 0;
        setSite();
      } else {
        SmartDialog.showToast("哔哩哔哩登录已失效，请重新登录");
        logout();
      }
    } catch (e) {
      SmartDialog.showToast("获取哔哩哔哩用户信息失败，可前往账号管理重试");
    }
  }

  void setSite() {
    var site = (Sites.allSites[Constant.kBiliBili]!.liveSite as BiliBiliSite);
    site.userId = uid;
    site.cookie = cookie;
  }

  void setCookie(String cookie) {
    this.cookie = cookie;
    LocalStorageService.instance
        .setValue(LocalStorageService.kBilibiliCookie, cookie);
    logined.value = cookie.isNotEmpty;
    // 上传 Cookie 到服务端
    _uploadCookieToServer(cookie);
  }

  void logout() async {
    cookie = "";
    uid = 0;
    name.value = "未登录";
    setSite();
    LocalStorageService.instance
        .setValue(LocalStorageService.kBilibiliCookie, "");
    logined.value = false;
    // 双向清除：同时删除服务端的 Cookie
    _deleteCookieFromServer();

    if (Platform.isAndroid || Platform.isIOS) {
      CookieManager cookieManager = CookieManager.instance();
      await cookieManager.deleteAllCookies();
    }
  }

  /// 上传 Cookie 到服务端
  Future<void> _uploadCookieToServer(String cookie) async {
    if (cookie.isEmpty) return;
    final serverUrl = await LiveApiFactory.resolveBaseUrl();
    if (serverUrl.isEmpty) return;
    try {
      await HttpClient.instance.putJson(
        '$serverUrl/api/v1/cookie/bilibili',
        data: {'cookie': cookie},
      );
      Log.d('B站Cookie已上传到服务端');
    } catch (e) {
      Log.d('B站Cookie上传失败: $e');
    }
  }

  /// 删除服务端的 Cookie
  Future<void> _deleteCookieFromServer() async {
    final serverUrl = await LiveApiFactory.resolveBaseUrl();
    if (serverUrl.isEmpty) return;
    try {
      // 使用 DELETE 请求清除服务端 Cookie
      final dio = HttpClient.instance.dio;
      await dio.delete('$serverUrl/api/v1/cookie/bilibili');
      Log.d('B站Cookie已从服务端删除');
    } catch (e) {
      Log.d('B站Cookie删除失败: $e');
    }
  }

  /// 从服务端拉取 Cookie
  ///
  /// 仅在本地没有 Cookie 时从服务端拉取
  Future<void> _syncCookieFromServer() async {
    if (cookie.isNotEmpty) return; // 本地已有 Cookie，不需要拉取
    final serverUrl = await LiveApiFactory.resolveBaseUrl();
    if (serverUrl.isEmpty) return;
    try {
      final result = await HttpClient.instance.getJson(
        '$serverUrl/api/v1/cookie/bilibili',
      );
      if (result['code'] == 0) {
        final serverCookie = result['data']['cookie'] as String;
        if (serverCookie.isNotEmpty) {
          this.cookie = serverCookie;
          LocalStorageService.instance
              .setValue(LocalStorageService.kBilibiliCookie, serverCookie);
          logined.value = true;
          setSite();
          loadUserInfo();
          Log.d('B站Cookie已从服务端拉取');
        }
      }
    } catch (e) {
      Log.d('B站Cookie拉取失败: $e');
    }
  }
}
