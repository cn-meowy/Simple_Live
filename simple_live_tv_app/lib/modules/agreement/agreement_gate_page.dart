import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_smart_dialog/flutter_smart_dialog.dart';
import 'package:get/get.dart';
import 'package:simple_live_tv_app/app/app_focus_node.dart';
import 'package:simple_live_tv_app/app/app_style.dart';
import 'package:simple_live_tv_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_tv_app/routes/route_path.dart';
import 'package:simple_live_tv_app/widgets/app_scaffold.dart';
import 'package:simple_live_tv_app/widgets/button/highlight_button.dart';

/// 首次启动协议同意门控页
///
/// 首次启动 App 时全屏展示，用户须同意《用户协议》与《隐私协议》后方可进入主界面。
class AgreementGatePage extends StatelessWidget {
  const AgreementGatePage({super.key});

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      child: Center(
        child: SizedBox(
          width: 1100.w,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                "用户协议与隐私协议",
                textAlign: TextAlign.center,
                style: AppStyle.titleStyleWhite.copyWith(
                  fontSize: 48.w,
                  fontWeight: FontWeight.bold,
                ),
              ),
              AppStyle.vGap24,
              Text(
                "欢迎使用 Simple Live TV。在使用本应用之前，请您仔细阅读并充分理解以下协议。点击「同意并继续」即表示您已阅读并同意以下协议的全部内容。",
                textAlign: TextAlign.center,
                style: AppStyle.textStyleWhite.copyWith(fontSize: 26.w),
              ),
              AppStyle.vGap32,
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  HighlightButton(
                    focusNode: AppFocusNode(),
                    iconData: Icons.description_outlined,
                    text: "查看完整《用户协议》",
                    onTap: () {
                      Get.toNamed(RoutePath.kUserAgreement);
                    },
                  ),
                  AppStyle.hGap32,
                  HighlightButton(
                    focusNode: AppFocusNode(),
                    iconData: Icons.privacy_tip_outlined,
                    text: "查看完整《隐私协议》",
                    onTap: () {
                      Get.toNamed(RoutePath.kPrivacyPolicy);
                    },
                  ),
                ],
              ),
              AppStyle.vGap48,
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  HighlightButton(
                    text: "不同意",
                    focusNode: AppFocusNode(),
                    onTap: () {
                      SmartDialog.showToast(
                        "您需要同意《用户协议》与《隐私协议》才能使用本应用",
                      );
                    },
                  ),
                  AppStyle.hGap32,
                  HighlightButton(
                    text: "同意并继续",
                    autofocus: true,
                    focusNode: AppFocusNode(),
                    onTap: () {
                      AppSettingsController.instance.setNoFirstRun();
                      Get.offAllNamed(RoutePath.kHome);
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
