import 'dart:async';

import 'package:flutter_smart_dialog/flutter_smart_dialog.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/log.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/requests/http_client.dart';

enum GenericQRStatus {
  loading,
  unscanned,
  scanned,
  expired,
  failed,
}

/// 通用 QR 登录控制器
///
/// 通过服务端 `generateSiteQR` / `pollSiteQR` 接口完成扫码登录。
/// QR 数据来源于服务端生成的 PNG base64，客户端直接渲染。
class GenericQRLoginController extends GetxController {
  GenericQRLoginController({required this.siteId});

  final String siteId;

  Timer? _timer;

  /// 服务端返回的二维码图片 base64 data URL
  var qrImageBase64 = "".obs;

  /// 服务端返回的 qrcodeKey（轮询使用）
  String _qrcodeKey = "";

  /// 二维码状态
  var qrStatus = GenericQRStatus.loading.obs;

  /// 轮询间隔
  static const Duration _pollInterval = Duration(seconds: 3);

  @override
  void onInit() {
    super.onInit();
    loadQRCode();
  }

  @override
  void onClose() {
    _timer?.cancel();
    super.onClose();
  }

  Future<void> loadQRCode() async {
    final serverUrl = await LiveApiFactory.resolveBaseUrl();
    if (serverUrl.isEmpty) {
      SmartDialog.showToast("请先在设置中配置服务端地址");
      qrStatus.value = GenericQRStatus.failed;
      return;
    }
    try {
      qrStatus.value = GenericQRStatus.loading;
      final result = await HttpClient.instance.postJson(
        '$serverUrl/api/v1/sites/$siteId/account/qr/generate',
      );
      final data = result['data'] as Map<String, dynamic>;
      _qrcodeKey = data['qrcodeKey'] as String;
      qrImageBase64.value = data['qrImageBase64'] as String;
      qrStatus.value = GenericQRStatus.unscanned;
      _startPoll();
    } catch (e) {
      Log.logPrint(e);
      SmartDialog.showToast(e.toString());
      qrStatus.value = GenericQRStatus.failed;
    }
  }

  void _startPoll() {
    _timer?.cancel();
    _timer = Timer.periodic(_pollInterval, (_) => pollQRStatus());
  }

  Future<void> pollQRStatus() async {
    if (_qrcodeKey.isEmpty) return;
    final serverUrl = await LiveApiFactory.resolveBaseUrl();
    if (serverUrl.isEmpty) return;
    try {
      final result = await HttpClient.instance.getJson(
        '$serverUrl/api/v1/sites/$siteId/account/qr/poll?qrcodeKey=$_qrcodeKey',
      );
      final status = result['data']['status'] as String;
      switch (status) {
        case 'confirmed':
          _timer?.cancel();
          SmartDialog.showToast("登录成功");
          Get.back<bool>(result: true);
          break;
        case 'scanned':
          qrStatus.value = GenericQRStatus.scanned;
          break;
        case 'expired':
          qrStatus.value = GenericQRStatus.expired;
          _qrcodeKey = "";
          _timer?.cancel();
          break;
        default:
          qrStatus.value = GenericQRStatus.unscanned;
      }
    } catch (e) {
      Log.logPrint(e);
    }
  }
}