import 'dart:async';
import 'dart:convert';

import 'package:flutter_smart_dialog/flutter_smart_dialog.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/app/event_bus.dart';
import 'package:simple_live_app/app/constant.dart';
import 'package:simple_live_app/app/log.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/models/db/follow_user.dart';
import 'package:simple_live_app/models/db/follow_user_tag.dart';
import 'package:simple_live_app/models/db/history.dart';
import 'package:simple_live_app/requests/http_client.dart';
import 'package:simple_live_app/services/bilibili_account_service.dart';
import 'package:simple_live_app/services/db_service.dart';
import 'package:simple_live_app/services/douyin_account_service.dart';
import 'package:simple_live_app/services/local_storage_service.dart';

/// 服务端同步服务
///
/// 替代原有局域网 UDP+HTTP 同步。
/// 同步条件：只要配置了服务端地址且服务端可用即可同步，不依赖"服务端启用"开关。
/// 同步策略：并集 + 时间戳优先（由服务端合并逻辑保证）。
class ServerSyncService extends GetxService {
  static ServerSyncService get instance => Get.find<ServerSyncService>();

  /// 是否正在同步
  var syncing = false.obs;

  /// 同步状态消息
  var syncStatus = "".obs;

  /// 定时同步 Timer
  Timer? _syncTimer;

  @override
  void onInit() {
    // 如果开启了自动同步，启动定时器
    if (AppSettingsController.instance.serverSyncEnable.value) {
      startAutoSync();
    }
    super.onInit();
  }

  @override
  void onClose() {
    _syncTimer?.cancel();
    super.onClose();
  }

  /// 解析服务端有效 baseUrl（含端口）
  Future<String> _resolveServerUrl() => LiveApiFactory.resolveBaseUrl();

  /// 获取设备 ID（用于数据分区）
  String get _deviceId {
    _cachedDeviceId ??= LocalStorageService.instance
        .getValue(LocalStorageService.kFirstRun, true)
        .toString();
    return _cachedDeviceId!;
  }

  String? _cachedDeviceId;

  /// 检测服务端可用性
  Future<bool> checkServerAvailable() async {
    final serverUrl = await _resolveServerUrl();
    if (serverUrl.isEmpty) return false;
    try {
      final result = await HttpClient.instance.getText('$serverUrl/health');
      return result == 'ok';
    } catch (e) {
      Log.d('服务端不可用: $e');
      return false;
    }
  }

  /// 启动自动同步（每小时同步一次）
  void startAutoSync() {
    _syncTimer?.cancel();
    _syncTimer = Timer.periodic(const Duration(hours: 1), (timer) {
      syncAll();
    });
  }

  /// 停止自动同步
  void stopAutoSync() {
    _syncTimer?.cancel();
    _syncTimer = null;
  }

  /// 执行全量同步（关注+标签+观看记录+屏蔽词）
  Future<void> syncAll() async {
    if (syncing.value) return;
    final serverUrl = await _resolveServerUrl();
    if (serverUrl.isEmpty) {
      SmartDialog.showToast("请先配置服务端地址");
      return;
    }

    syncing.value = true;
    syncStatus.value = "正在同步...";

    try {
      // 先检测服务端可用性
      if (!await checkServerAvailable()) {
        SmartDialog.showToast("服务端不可用");
        syncStatus.value = "服务端不可用";
        syncing.value = false;
        return;
      }

      // 1. 同步关注和标签（必须同时同步）
      await syncFollowAndTag();

      // 2. 同步观看记录
      await syncHistory();

      // 3. 同步屏蔽词
      await syncBlockedWords();

      // 4. 同步 Cookie
      await syncCookies();

      // 更新同步时间
      final now = DateTime.now().toString();
      AppSettingsController.instance.setServerLastSyncTime(now);

      syncStatus.value = "同步完成";
      SmartDialog.showToast("同步完成");

      // 通知关注列表刷新
      EventBus.instance.emit(Constant.kUpdateFollow, 0);
    } catch (e, stackTrace) {
      Log.e("同步失败: $e", stackTrace);
      syncStatus.value = "同步失败: $e";
      SmartDialog.showToast("同步失败");
    } finally {
      syncing.value = false;
    }
  }

  /// 同步关注列表和标签（必须同时同步）
  Future<void> syncFollowAndTag() async {
    final serverUrl = await _resolveServerUrl();
    if (serverUrl.isEmpty) return;
    syncStatus.value = "正在同步关注列表...";

    // 上传本地关注列表
    final localFollows = DBService.instance.getFollowList();
    final followJson = localFollows.map((e) => e.toJson()).toList();

    final followResult = await HttpClient.instance.postJson(
      '$serverUrl/api/v1/sync/follow',
      data: followJson,
      header: {'X-Device-Id': _deviceId},
    );

    // 用服务端返回的合并数据替换本地
    if (followResult['code'] == 0) {
      final mergedFollows = (followResult['data'] as List<dynamic>)
          .map((e) => FollowUser.fromJson(e as Map<String, dynamic>))
          .toList();

      // 清空本地后写入合并数据
      await DBService.instance.followBox.clear();
      for (var follow in mergedFollows) {
        await DBService.instance.addFollow(follow);
      }
    }

    // 上传本地标签
    syncStatus.value = "正在同步标签...";
    final localTags = DBService.instance.getFollowTagList();
    final tagJson = localTags.map((e) => e.toJson()).toList();

    final tagResult = await HttpClient.instance.postJson(
      '$serverUrl/api/v1/sync/tag',
      data: tagJson,
      header: {'X-Device-Id': _deviceId},
    );

    if (tagResult['code'] == 0) {
      final mergedTags = (tagResult['data'] as List<dynamic>)
          .map((e) => FollowUserTag.fromJson(e as Map<String, dynamic>))
          .toList();

      await DBService.instance.tagBox.clear();
      for (var tag in mergedTags) {
        await DBService.instance.updateFollowTag(tag);
      }
    }
  }

  /// 同步观看记录
  Future<void> syncHistory() async {
    final serverUrl = await _resolveServerUrl();
    if (serverUrl.isEmpty) return;
    syncStatus.value = "正在同步观看记录...";

    final localHistories = DBService.instance.getHistores();
    final historyJson = localHistories.map((e) => e.toJson()).toList();

    final result = await HttpClient.instance.postJson(
      '$serverUrl/api/v1/sync/history',
      data: historyJson,
      header: {'X-Device-Id': _deviceId},
    );

    if (result['code'] == 0) {
      final mergedHistories = (result['data'] as List<dynamic>)
          .map((e) => History.fromJson(e as Map<String, dynamic>))
          .toList();

      await DBService.instance.historyBox.clear();
      for (var history in mergedHistories) {
        await DBService.instance.addOrUpdateHistory(history);
      }
    }
  }

  /// 同步屏蔽词
  Future<void> syncBlockedWords() async {
    final serverUrl = await _resolveServerUrl();
    if (serverUrl.isEmpty) return;
    syncStatus.value = "正在同步屏蔽词...";

    final localWords = LocalStorageService.instance.shieldBox.values.toList();

    final result = await HttpClient.instance.postJson(
      '$serverUrl/api/v1/sync/blocked_word',
      data: localWords,
      header: {'X-Device-Id': _deviceId},
    );

    if (result['code'] == 0) {
      final mergedWords = (result['data'] as List<dynamic>)
          .map((e) => e as String)
          .toList();

      await LocalStorageService.instance.shieldBox.clear();
      for (var word in mergedWords) {
        await LocalStorageService.instance.shieldBox.put(word, word);
      }
      // ignore: invalid_use_of_protected_member
      AppSettingsController.instance.shieldList.value =
          LocalStorageService.instance.shieldBox.values.toSet();
    }
  }

  /// 从服务端拉取 Cookie
  Future<void> syncCookies() async {
    final serverUrl = await _resolveServerUrl();
    if (serverUrl.isEmpty) return;
    syncStatus.value = "正在同步Cookie...";

    // 拉取 B站 Cookie
    try {
      final bilibiliResult = await HttpClient.instance.getJson(
        '$serverUrl/api/v1/cookie/bilibili',
        header: {'X-Device-Id': _deviceId},
      );
      if (bilibiliResult['code'] == 0) {
        final cookie = bilibiliResult['data']['cookie'] as String;
        if (cookie.isNotEmpty) {
          // 只有本地没有 Cookie 时才从服务端拉取
          final localCookie = LocalStorageService.instance
              .getValue(LocalStorageService.kBilibiliCookie, "");
          if (localCookie.isEmpty) {
            BiliBiliAccountService.instance.setCookie(cookie);
          }
        }
      }
    } catch (e) {
      Log.d('拉取B站Cookie失败: $e');
    }

    // 拉取抖音 Cookie
    try {
      final douyinResult = await HttpClient.instance.getJson(
        '$serverUrl/api/v1/cookie/douyin',
        header: {'X-Device-Id': _deviceId},
      );
      if (douyinResult['code'] == 0) {
        final cookie = douyinResult['data']['cookie'] as String;
        if (cookie.isNotEmpty) {
          final localCookie = LocalStorageService.instance
              .getValue(LocalStorageService.kDouyinCookie, "");
          if (localCookie.isEmpty) {
            DouyinAccountService.instance.setCookie(cookie);
          }
        }
      }
    } catch (e) {
      Log.d('拉取抖音Cookie失败: $e');
    }
  }

  /// 仅拉取数据（不合并，只从服务端获取）
  Future<void> pullData() async {
    final serverUrl = await _resolveServerUrl();
    if (serverUrl.isEmpty) {
      SmartDialog.showToast("请先配置服务端地址");
      return;
    }

    syncing.value = true;
    try {
      if (!await checkServerAvailable()) {
        SmartDialog.showToast("服务端不可用");
        syncing.value = false;
        return;
      }

      // 拉取关注列表
      final followResult = await HttpClient.instance.getJson(
        '$serverUrl/api/v1/sync/follow',
        header: {'X-Device-Id': _deviceId},
      );
      if (followResult['code'] == 0) {
        final follows = (followResult['data'] as List<dynamic>)
            .map((e) => FollowUser.fromJson(e as Map<String, dynamic>))
            .toList();
        for (var follow in follows) {
          await DBService.instance.addFollow(follow);
        }
      }

      // 拉取标签
      final tagResult = await HttpClient.instance.getJson(
        '$serverUrl/api/v1/sync/tag',
        header: {'X-Device-Id': _deviceId},
      );
      if (tagResult['code'] == 0) {
        final tags = (tagResult['data'] as List<dynamic>)
            .map((e) => FollowUserTag.fromJson(e as Map<String, dynamic>))
            .toList();
        for (var tag in tags) {
          await DBService.instance.updateFollowTag(tag);
        }
      }

      EventBus.instance.emit(Constant.kUpdateFollow, 0);
      SmartDialog.showToast("拉取完成");
    } catch (e) {
      SmartDialog.showToast("拉取失败");
    } finally {
      syncing.value = false;
    }
  }
}
