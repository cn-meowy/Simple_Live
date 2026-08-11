import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_app/app/services/sites_service.dart';
import 'package:simple_live_app/modules/mine/account/account_controller.dart';

class AccountPage extends GetView<AccountController> {
  const AccountPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("账号管理")),
      body: Obx(() {
        final sites = SitesService.instance.remoteSites
            .where((s) => s.account != null)
            .toList();
        if (sites.isEmpty) {
          return const Center(child: Text("暂无可配置的账号"));
        }
        return ListView.builder(
          itemCount: sites.length,
          itemBuilder: (context, index) => _buildSiteTile(sites[index]),
        );
      }),
    );
  }

  Widget _buildSiteTile(Site site) {
    final descriptor = site.account!;
    return ListTile(
      leading: Image.asset(
        site.logo,
        width: 36,
        height: 36,
        errorBuilder: (_, __, ___) => const Icon(Icons.tv),
      ),
      title: Text(site.name),
      subtitle: Text(descriptor.hint),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => controller.onSiteTap(site),
    );
  }
}