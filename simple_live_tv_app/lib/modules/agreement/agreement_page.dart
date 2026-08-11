import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:get/get.dart';
import 'package:simple_live_tv_app/app/app_focus_node.dart';
import 'package:simple_live_tv_app/app/app_style.dart';
import 'package:simple_live_tv_app/widgets/app_scaffold.dart';
import 'package:simple_live_tv_app/widgets/button/highlight_button.dart';

/// 协议查看页
///
/// 从 `assetPath` 加载协议纯文本并展示，可通过遥控器滚动浏览。
class AgreementPage extends StatelessWidget {
  final String title;
  final String assetPath;

  const AgreementPage({
    required this.title,
    required this.assetPath,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      child: Column(
        children: [
          AppStyle.vGap32,
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              AppStyle.hGap48,
              HighlightButton(
                focusNode: AppFocusNode(),
                iconData: Icons.arrow_back,
                text: "返回",
                onTap: () {
                  Get.back();
                },
              ),
              AppStyle.hGap32,
              Text(
                title,
                style: AppStyle.titleStyleWhite.copyWith(
                  fontSize: 36.w,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Spacer(),
            ],
          ),
          AppStyle.vGap24,
          Expanded(
            child: SizedBox(
              width: 1200.w,
              child: FutureBuilder<String>(
                future: rootBundle.loadString(assetPath),
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snapshot.hasError) {
                    return Center(
                      child: Text(
                        '加载失败：${snapshot.error}',
                        style: AppStyle.textStyleWhite,
                      ),
                    );
                  }
                  return SingleChildScrollView(
                    padding: AppStyle.edgeInsetsA24,
                    child: SelectableText(
                      snapshot.data ?? '',
                      style: AppStyle.textStyleWhite.copyWith(
                        height: 1.6,
                        fontSize: 24.w,
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
