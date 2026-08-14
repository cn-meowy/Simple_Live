import 'package:get/get.dart';
import 'package:simple_live_app/app/constant.dart';
import 'package:simple_live_app/app/log.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_app/requests/http_client.dart';
import 'package:simple_live_app/services/local_storage_service.dart';
import 'package:simple_live_app/core/simple_live_core.dart';

class DouyinAccountService extends GetxService {
  static DouyinAccountService get instance =>
      Get.find<DouyinAccountService>();

  var cookie = "";
  var hasCookie = false.obs;

  @override
  void onInit() {
    cookie = LocalStorageService.instance
        .getValue(LocalStorageService.kDouyinCookie, "");
    hasCookie.value = cookie.isNotEmpty;
    setSite();
    // 从服务端拉取 Cookie（如果本地没有的话）
    _syncCookieFromServer();
    super.onInit();
  }

  void setSite() {
    var site = (Sites.allSites[Constant.kDouyin]!.liveSite as DouyinSite);
    site.cookie = cookie;
  }

  void setCookie(String cookie) {
    this.cookie = cookie;
    LocalStorageService.instance
        .setValue(LocalStorageService.kDouyinCookie, cookie);
    hasCookie.value = cookie.isNotEmpty;
    setSite();
    // 上传 Cookie 到服务端
    _uploadCookieToServer(cookie);
  }

  void clearCookie() {
    cookie = "";
    LocalStorageService.instance
        .setValue(LocalStorageService.kDouyinCookie, "");
    hasCookie.value = false;
    setSite();
    // 双向清除：同时删除服务端的 Cookie
    _deleteCookieFromServer();
  }

  /// 上传 Cookie 到服务端
  Future<void> _uploadCookieToServer(String cookie) async {
    if (cookie.isEmpty) return;
    final serverUrl = await LiveApiFactory.resolveBaseUrl();
    if (serverUrl.isEmpty) return;
    try {
      await HttpClient.instance.putJson(
        '$serverUrl/api/v1/cookie/douyin',
        data: {'cookie': cookie},
      );
      Log.d('抖音Cookie已上传到服务端');
    } catch (e) {
      Log.d('抖音Cookie上传失败: $e');
    }
  }

  /// 删除服务端的 Cookie
  Future<void> _deleteCookieFromServer() async {
    final serverUrl = await LiveApiFactory.resolveBaseUrl();
    if (serverUrl.isEmpty) return;
    try {
      final dio = HttpClient.instance.dio;
      await dio.delete('$serverUrl/api/v1/cookie/douyin');
      Log.d('抖音Cookie已从服务端删除');
    } catch (e) {
      Log.d('抖音Cookie删除失败: $e');
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
        '$serverUrl/api/v1/cookie/douyin',
      );
      if (result['code'] == 0) {
        final serverCookie = result['data']['cookie'] as String;
        if (serverCookie.isNotEmpty) {
          this.cookie = serverCookie;
          LocalStorageService.instance
              .setValue(LocalStorageService.kDouyinCookie, serverCookie);
          hasCookie.value = true;
          setSite();
          Log.d('抖音Cookie已从服务端拉取');
        }
      }
    } catch (e) {
      Log.d('抖音Cookie拉取失败: $e');
    }
  }
}
