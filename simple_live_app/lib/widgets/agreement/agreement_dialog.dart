import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/app_style.dart';
import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/routes/route_path.dart';

/// 首次启动展示的用户协议与隐私协议同意弹窗
///
/// 不可被返回键 / 点击外部关闭，仅提供「不同意并退出」「同意并继续」两个按钮。
class AgreementDialog extends StatelessWidget {
  const AgreementDialog({super.key});

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: AlertDialog(
        title: const Text("用户协议与隐私协议"),
        content: SizedBox(
          width: double.maxFinite,
          child: SingleChildScrollView(
            padding: AppStyle.edgeInsetsA8,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "欢迎使用 Meow Live。在使用本应用之前，请您仔细阅读并充分理解以下协议。点击「同意并继续」即表示您已阅读并同意以下协议的全部内容。",
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                AppStyle.vGap12,
                InkWell(
                  onTap: () {
                    Get.toNamed(
                      RoutePath.kSettingsAgreement,
                      arguments: {
                        "title": "用户协议",
                        "assetPath":
                            "assets/agreements/user_agreement.txt",
                      },
                    );
                  },
                  child: Padding(
                    padding: AppStyle.edgeInsetsV4,
                    child: Text(
                      "《用户协议》",
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.primary,
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ),
                ),
                InkWell(
                  onTap: () {
                    Get.toNamed(
                      RoutePath.kSettingsAgreement,
                      arguments: {
                        "title": "隐私协议",
                        "assetPath":
                            "assets/agreements/privacy_policy.txt",
                      },
                    );
                  },
                  child: Padding(
                    padding: AppStyle.edgeInsetsV4,
                    child: Text(
                      "《隐私协议》",
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.primary,
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: _exitApp,
            child: const Text("不同意并退出"),
          ),
          FilledButton(
            onPressed: () {
              AppSettingsController.instance.setNoFirstRun();
              Get.back();
            },
            child: const Text("同意并继续"),
          ),
        ],
      ),
    );
  }

  void _exitApp() {
    if (Platform.isAndroid || Platform.isIOS) {
      SystemNavigator.pop();
    } else {
      exit(0);
    }
  }
}

/// 展示首次启动协议弹窗
Future<void> showAgreementDialog() async {
  await Get.dialog<void>(
    const AgreementDialog(),
    barrierDismissible: false,
  );
}
