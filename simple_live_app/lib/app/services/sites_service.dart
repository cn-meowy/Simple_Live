import 'package:get/get.dart';
import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/app/log.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_app/models/account/site_account_descriptor.dart';

/// 远程站点列表服务
///
/// 启动时从后端 `/api/v1/sites` 拉取站点列表（`{id, name}`），
/// 供首页/分类/搜索的 Tab 渲染。
///
/// - 拉取成功：`remoteSites` 非空，`Sites.supportSites` 返回它
/// - 后端返回空 / 拉取失败 / 未配置服务端：`remoteSites` 为空，
///   `Sites.supportSites` 返回空列表（UI 显示空态），不回退到本地 `allSites`
///
/// logo 用本地 assets 映射兜底（已知 4 平台有图，未知用默认 logo）。
class SitesService extends GetxService {
  static SitesService get instance => Get.find<SitesService>();

  /// 后端返回的站点列表（响应式，UI 可监听）
  final RxList<Site> remoteSites = <Site>[].obs;

  /// 已知平台的 logo 映射（assets 路径）
  static const Map<String, String> _logoMap = {
    'bilibili': 'assets/images/bilibili_2.png',
    'douyu': 'assets/images/douyu.png',
    'huya': 'assets/images/huya.png',
    'douyin': 'assets/images/douyin.png',
    'local': 'assets/images/logo.png',
  };

  /// 默认 logo（未知平台兜底）
  static const String _defaultLogo = 'assets/images/logo.png';

  /// 从后端拉取站点列表
  ///
  /// 成功后按 `siteSort` 重排 `remoteSites`，新站点追加末尾并持久化排序。
  /// 失败或返回空时 `remoteSites` 保持为空（不回退到本地），不抛异常。
  Future<void> fetchRemoteSites() async {
    final settings = AppSettingsController.instance;
    final url = settings.serverUrl.value;
    Log.d('fetchRemoteSites start: serverUrl=$url');
    try {
      final api = await LiveApiFactory.instanceAsync;
      Log.d('fetchRemoteSites: instance ready, requesting /api/v1/sites');
      final list = await api.getSites();
      Log.d('fetchRemoteSites: response count=${list.length}');
      if (list.isEmpty) {
        Log.w('后端返回空站点列表 url=$url');
        return;
      }

      final sites = list.map((e) {
        final id = e['id'] ?? '';
        final name = e['name'] ?? id;
        return Site(
          id: id,
          name: name,
          logo: _logoMap[id] ?? _defaultLogo,
          account: SiteAccountDescriptor.fromJsonOrNull(
            (e['account'] as Map?)?.cast<String, dynamic>(),
          ),
        );
      }).toList();

      final newSites = _sortBySiteSort(sites);
      remoteSites.assignAll(newSites);
      _syncSiteSort(remoteSites.map((s) => s.id).toList());
      Log.d('远程站点列表拉取成功: ${remoteSites.length} 个');
    } on TypeError catch (e, s) {
      Log.e('解析 /sites 响应失败 url=$url, error=$e', s);
      remoteSites.clear();
    } catch (e, s) {
      Log.e('拉取远程站点列表失败 url=$url, error=$e', s);
      remoteSites.clear();
    }
  }

  /// 按用户排序（`siteSort`）重排站点列表，未在排序中的追加末尾
  List<Site> _sortBySiteSort(List<Site> sites) {
    List<String> sort;
    try {
      sort = AppSettingsController.instance.siteSort.toList();
    } catch (_) {
      sort = <String>[];
    }
    final idToSite = {for (final s in sites) s.id: s};
    final result = <Site>[];
    final remaining = <Site>[];

    // 保留排序中存在的站点
    for (final id in sort) {
      final s = idToSite.remove(id);
      if (s != null) {
        result.add(s);
      }
    }
    // 排序中不存在的新站点追加末尾（保持后端返回顺序）
    for (final s in sites) {
      if (idToSite.containsKey(s.id)) {
        remaining.add(s);
      }
    }
    result.addAll(remaining);
    return result;
  }

  /// 同步 siteSort：移除已不存在的 siteId，追加新增的 siteId，变更时持久化
  void _syncSiteSort(List<String> remoteIds) {
    try {
      final settings = AppSettingsController.instance;
      final oldSort = settings.siteSort.toList();
      // 只保留后端仍存在的 siteId
      final newSort = oldSort.where((id) => remoteIds.contains(id)).toList();
      // 追加新出现的 siteId
      for (final id in remoteIds) {
        if (!newSort.contains(id)) {
          newSort.add(id);
        }
      }
      if (newSort.length != oldSort.length || !_listEquals(newSort, oldSort)) {
        settings.setSiteSort(newSort);
      }
    } catch (e) {
      Log.w('同步 siteSort 失败: $e');
    }
  }

  bool _listEquals(List<String> a, List<String> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}
