import 'package:flutter_smart_dialog/flutter_smart_dialog.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/app/log.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_app/models/account/site_account_descriptor.dart';
import 'package:simple_live_app/requests/http_client.dart';
import 'package:simple_live_app/routes/route_path.dart';
import 'package:simple_live_app/services/bilibili_account_service.dart';
import 'package:simple_live_app/services/douyin_account_service.dart';

/// 账号管理控制器（接口化版本）
///
/// 列表由后端 `/api/v1/sites` 返回的 `account` 描述符驱动，
/// 每个站点的账号页类型决定点击行为。
class AccountController extends GetxController {
  /// 获取服务端实际登录状态（基于 cookie 是否存在）
  Future<bool> hasCookie(String siteId) async {
    try {
      final serverUrl = AppSettingsController.instance.serverUrl.value;
      if (serverUrl.isEmpty) return false;
      final result = await HttpClient.instance.getJson(
        '$serverUrl/api/v1/cookie/$siteId',
      );
      final cookie = result['data']['cookie'] as String? ?? '';
      return cookie.isNotEmpty;
    } catch (e) {
      Log.w('读取 $siteId cookie 状态失败: $e');
      return false;
    }
  }

  void onSiteTap(Site site) {
    final descriptor = site.account;
    if (descriptor == null || descriptor.type == SiteAccountType.none) return;
    switch (descriptor.type) {
      case SiteAccountType.qr:
        Get.toNamed(RoutePath.kSiteAccountQR, parameters: {'siteId': site.id});
        break;
      case SiteAccountType.cookie:
        // qr 类型在 QR 页内可二次跳转到 cookie（保持向后兼容）
        Get.toNamed(RoutePath.kSiteAccountCookie, parameters: {'siteId': site.id});
        break;
      case SiteAccountType.username:
        Get.toNamed(
          RoutePath.kSiteAccountUsername,
          parameters: {
            'siteId': site.id,
            'label': descriptor.label,
            'hint': descriptor.hint,
          },
        );
        break;
      case SiteAccountType.none:
        break;
    }
  }

  /// 通用 cookie 清除
  Future<void> clearCookie(String siteId) async {
    try {
      final serverUrl = AppSettingsController.instance.serverUrl.value;
      if (serverUrl.isEmpty) return;
      final dio = HttpClient.instance.dio;
      await dio.delete('$serverUrl/api/v1/cookie/$siteId');
      // 同步本地状态
      if (siteId == 'bilibili') {
        BiliBiliAccountService.instance.logout();
      } else if (siteId == 'douyin') {
        DouyinAccountService.instance.clearCookie();
      }
      SmartDialog.showToast("已清除");
    } catch (e) {
      Log.logPrint(e);
      SmartDialog.showToast("清除失败：$e");
    }
  }

  /// 测试方法：用于在 QR 页内跳转到 Cookie 页
  void gotoCookieFromQR(String siteId) {
    Get.back();
    Get.toNamed(RoutePath.kSiteAccountCookie, parameters: {'siteId': siteId});
  }

  /// 探测是否有用户名（用于 username 站点的副标题）
  Future<bool> hasUsername(String siteId) async {
    try {
      final serverUrl = AppSettingsController.instance.serverUrl.value;
      if (serverUrl.isEmpty) return false;
      final result = await HttpClient.instance.getJson(
        '$serverUrl/api/v1/sites/$siteId/account/username',
      );
      final v = result['data']['username'] as String? ?? '';
      return v.isNotEmpty;
    } catch (_) {
      return false;
    }
  }
}