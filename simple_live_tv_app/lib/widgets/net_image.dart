import 'package:extended_image/extended_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:simple_live_tv_app/app/controller/app_settings_controller.dart';

class NetImage extends StatelessWidget {
  final String picUrl;
  final double? width;
  final double? height;
  final BoxFit? fit;
  final double borderRadius;
  final int? cacheWidth;
  const NetImage(this.picUrl,
      {this.width,
      this.height,
      this.fit = BoxFit.cover,
      this.borderRadius = 0,
      this.cacheWidth,
      Key? key})
      : super(key: key);

  @override
  Widget build(BuildContext context) {
    var pic = picUrl;
    if (pic.startsWith("//")) {
      pic = 'https:$pic';
    } else if (pic.startsWith("/api/")) {
      final serverUrl = AppSettingsController.instance.serverUrl.value
          .replaceAll(RegExp(r'/+$'), '');
      if (serverUrl.isNotEmpty) {
        pic = '$serverUrl$pic';
      }
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: ExtendedImage.network(
        pic,
        fit: fit,
        height: height,
        width: width,
        cacheWidth: cacheWidth,
        shape: BoxShape.rectangle,
        borderRadius: BorderRadius.circular(borderRadius),
        loadStateChanged: (e) {
          if (e.extendedImageLoadState == LoadState.loading) {
            return const SizedBox();
          }
          if (e.extendedImageLoadState == LoadState.failed) {
            return Icon(
              Icons.broken_image,
              color: Colors.grey,
              size: 24.w,
            );
          }
          return null;
        },
      ),
    );
  }
}
