import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/app_style.dart';
import 'package:simple_live_app/modules/mine/account/generic_qr_login_controller.dart';

/// 通用 QR 登录页
///
/// 显示服务端返回的二维码 PNG（base64），3s 轮询扫码状态。
class GenericQRLoginPage extends GetView<GenericQRLoginController> {
  const GenericQRLoginPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(controller.siteId)),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Center(
            child: Obx(() {
              switch (controller.qrStatus.value) {
                case GenericQRStatus.loading:
                  return const Padding(
                    padding: EdgeInsets.all(48),
                    child: CircularProgressIndicator(),
                  );
                case GenericQRStatus.failed:
                  return _buildRetryColumn(
                    message: "二维码加载失败",
                    actionText: "重试",
                  );
                case GenericQRStatus.expired:
                  return _buildRetryColumn(
                    message: "二维码已失效",
                    actionText: "刷新二维码",
                  );
                case GenericQRStatus.unscanned:
                case GenericQRStatus.scanned:
                  return Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ClipRRect(
                        borderRadius: AppStyle.radius12,
                        child: Container(
                          color: Colors.white,
                          padding: AppStyle.edgeInsetsA12,
                          child: Image.memory(
                            _decodeBase64(controller.qrImageBase64.value),
                            width: 220,
                            height: 220,
                            fit: BoxFit.contain,
                            errorBuilder: (context, error, stackTrace) => const SizedBox(
                              width: 220,
                              height: 220,
                              child: Center(child: Icon(Icons.broken_image)),
                            ),
                          ),
                        ),
                      ),
                      AppStyle.vGap8,
                      Visibility(
                        visible: controller.qrStatus.value ==
                            GenericQRStatus.scanned,
                        child: const Text("已扫描，请在手机上确认登录"),
                      ),
                    ],
                  );
              }
            }),
          ),
          Padding(
            padding: AppStyle.edgeInsetsA24,
            child: Text(
              "请使用对应平台手机客户端扫描二维码登录",
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRetryColumn({required String message, required String actionText}) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(message),
        TextButton(
          onPressed: controller.loadQRCode,
          child: Text(actionText),
        ),
      ],
    );
  }

  /// 从 base64 data URL 中提取纯 base64 内容并解码为字节
  static Uint8List _decodeBase64(String dataUrl) {
    final commaIndex = dataUrl.indexOf(',');
    final pureBase64 = commaIndex >= 0 ? dataUrl.substring(commaIndex + 1) : dataUrl;
    return base64Decode(pureBase64);
  }
}