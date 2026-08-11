import 'package:simple_live_app/app/constant.dart';
import 'package:simple_live_app/app/services/script_site_service.dart';
import 'package:simple_live_app/app/services/sites_service.dart';
import 'package:simple_live_app/core/simple_live_core.dart';
import 'package:simple_live_app/models/account/site_account_descriptor.dart';

class Sites {
  /// 全部站点（内置 + JS 动态加载）
  ///
  /// 启动时由 [reload] 构建，安装/卸载 JS 站点后会重新构建。
  static final Map<String, Site> allSites = {};

  /// 内置站点（只读）
  static final Map<String, Site> _builtinSites = {
    Constant.kBiliBili: Site(
      id: Constant.kBiliBili,
      logo: "assets/images/bilibili_2.png",
      name: "哔哩哔哩",
      liveSite: BiliBiliSite(),
    ),
    Constant.kDouyu: Site(
      id: Constant.kDouyu,
      logo: "assets/images/douyu.png",
      name: "斗鱼直播",
      liveSite: DouyuSite(),
    ),
    Constant.kHuya: Site(
      id: Constant.kHuya,
      logo: "assets/images/huya.png",
      name: "虎牙直播",
      liveSite: HuyaSite(),
    ),
    Constant.kDouyin: Site(
      id: Constant.kDouyin,
      logo: "assets/images/douyin.png",
      name: "抖音直播",
      liveSite: DouyinSite(),
    ),
    // 本地虚拟平台：服务端 demo 模式下唯一的可见平台。
    // 复用 LiveSite 默认实现：弹幕为 no-op（与 Node.js LocalDanmaku 一致），
    // 其余方法返回空默认值。实际数据由 RemoteLiveApi/EmbeddedLiveServer 经 HTTP 提供。
    Constant.kLocal: Site(
      id: Constant.kLocal,
      logo: "assets/images/logo.png",
      name: "本地",
      liveSite: LiveSite(),
    ),
  };

  /// 重新构建 [allSites]：内置站点 + 已安装的 JS 站点。
  ///
  /// 保留原 [allSites] 中的实例引用（避免重复构造内置站点的 liveSite）。
  /// 应在启动时以及 JS 站点安装/卸载/启停后调用。
  static void reload() {
    allSites
      ..clear()
      ..addAll(_builtinSites);

    // 合并已启用的 JS 站点
    try {
      final scriptSites = ScriptSiteService.instance.getEnabledSites();
      scriptSites.forEach((uuid, s) {
        allSites[uuid] = Site(
          id: uuid,
          logo: s.logo.isEmpty ? "assets/images/logo.png" : s.logo,
          name: s.name,
          liveSite: s,
        );
      });
    } catch (e) {
      // ScriptSiteService 尚未注册时忽略
    }
  }

  /// 首页/分类/搜索 Tab 展示的站点列表（完全由后端驱动，无本地回退）
  ///
  /// 返回后端 `/api/v1/sites` 拉取的 [SitesService.remoteSites]。
  /// - 后端返回空 / 拉取失败 / 未配置服务端 → 返回空列表（UI 显示空态）。
  /// - [SitesService] 尚未注册时返回空列表。
  ///
  /// 内置 [_builtinSites] / [allSites] 仅作弹幕、账号登录、解析、历史、关注、收藏
  /// 的 SDK 注册表，不再参与首页 Tab 展示。
  static List<Site> get supportSites {
    try {
      return SitesService.instance.remoteSites.toList();
    } catch (_) {
      return <Site>[];
    }
  }
}

class Site {
  final String id;
  final String name;
  final String logo;
  /// 直播站点实例，仅本地内置/JS 站点持有；后端返回的 UI 站点为 null。
  /// 弹幕与账号服务通过 [Sites.allSites] 获取（始终非空）。
  final LiveSite? liveSite;
  /// 账号描述符，由后端 `/api/v1/sites` 返回；null 表示该站点不需要账号设置。
  final SiteAccountDescriptor? account;
  Site({
    required this.id,
    this.liveSite,
    required this.logo,
    required this.name,
    this.account,
  });
}
