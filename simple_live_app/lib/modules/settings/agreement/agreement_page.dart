import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:simple_live_app/app/app_style.dart';

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
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
      ),
      body: FutureBuilder<String>(
        future: rootBundle.loadString(assetPath),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Text('加载失败：${snapshot.error}'),
            );
          }
          return SingleChildScrollView(
            padding: AppStyle.edgeInsetsA16,
            child: SelectableText(
              snapshot.data ?? '',
              style: const TextStyle(
                height: 1.6,
                fontSize: 14,
              ),
            ),
          );
        },
      ),
    );
  }
}
