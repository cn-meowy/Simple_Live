import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/app/services/live_api_service.dart';
import 'package:simple_live_app/app/services/sites_service.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_app/core/simple_live_core.dart';
import 'package:simple_live_app/modules/home/home_controller.dart';
import 'package:simple_live_app/modules/home/home_list_controller.dart';
import 'package:simple_live_app/modules/home/home_page.dart';

class _FakeLiveApi implements LiveApiService {
  @override
  Future<List<Map<String, String>>> getSites() async => [];

  @override
  Future<List<LiveCategory>> getCategores(String siteId) async => [];

  @override
  Future<LiveCategoryResult> getRecommendRooms(String siteId,
      {int page = 1}) async {
    return LiveCategoryResult(hasMore: false, items: []);
  }

  @override
  Future<LiveCategoryResult> getCategoryRooms(
    String siteId,
    LiveSubCategory category, {
    int page = 1,
  }) async {
    return LiveCategoryResult(hasMore: false, items: []);
  }

  @override
  Future<LiveSearchRoomResult> searchRooms(
    String siteId,
    String keyword, {
    int page = 1,
  }) async {
    return LiveSearchRoomResult(hasMore: false, items: []);
  }

  @override
  Future<LiveSearchAnchorResult> searchAnchors(
    String siteId,
    String keyword, {
    int page = 1,
  }) async {
    return LiveSearchAnchorResult(hasMore: false, items: []);
  }

  @override
  Future<LiveRoomDetail> getRoomDetail(String siteId, String roomId) async {
    throw UnimplementedError();
  }

  @override
  Future<bool> getLiveStatus(String siteId, String roomId) async => false;

  @override
  Future<List<LivePlayQuality>> getPlayQualites(
          String siteId, LiveRoomDetail detail) async =>
      [];

  @override
  Future<LivePlayUrl> getPlayUrls(
    String siteId,
    LiveRoomDetail detail,
    LivePlayQuality quality,
  ) async {
    throw UnimplementedError();
  }

  @override
  Future<List<LiveSuperChatMessage>> getSuperChatMessage(
          String siteId, String roomId) async =>
      [];

  @override
  LiveDanmaku getDanmaku(String siteId) => LiveDanmaku();
}

Site _site(String id, String name) => Site(
      id: id,
      name: name,
      logo: 'assets/images/logo.png',
    );

Future<void> _settleFrames(WidgetTester tester, {int frames = 5}) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  setUp(() {
    WidgetsFlutterBinding.ensureInitialized();
    Get.reset();
    Sites.reload();
    LiveApiFactory.overrideCreateInstance(() async {
      return _FakeLiveApi();
    });
    Get.put(SitesService(), permanent: true);
  });

  tearDown(() {
    Get.reset();
    LiveApiFactory.restoreCreateInstance();
  });

  testWidgets('设置路由内站点变化，返回后 controller 仍由父级持有且未注册到 GetX', (tester) async {
    final sitesService = SitesService.instance;
    sitesService.remoteSites.assignAll([_site('bilibili', '哔哩哔哩')]);

    final homeController = HomeController();
    Get.put<HomeController>(homeController);

    await tester.pumpWidget(
      const GetMaterialApp(
        home: HomePage(),
      ),
    );
    await _settleFrames(tester);

    expect(homeController.sites.map((s) => s.id), contains('bilibili'));
    expect(Get.isRegistered<HomeListController>(tag: 'bilibili'), isFalse);

    Get.to(Container(key: const ValueKey('settings_route')));
    await _settleFrames(tester);

    sitesService.remoteSites.assignAll([
      _site('bilibili', '哔哩哔哩'),
      _site('douyu', '斗鱼直播'),
    ]);
    await _settleFrames(tester);

    Get.back();
    await _settleFrames(tester);

    expect(homeController.sites.map((s) => s.id), contains('douyu'));
    expect(homeController.controllerFor('douyu'), isA<HomeListController>());
    expect(Get.isRegistered<HomeListController>(tag: 'douyu'), isFalse);
  });

  testWidgets('站点变化后无 build 阶段 markNeedsBuild 异常', (tester) async {
    final sitesService = SitesService.instance;
    sitesService.remoteSites.assignAll([_site('bilibili', '哔哩哔哩')]);

    final homeController = HomeController();
    Get.put<HomeController>(homeController);

    final errors = <FlutterErrorDetails>[];
    final originalOnError = FlutterError.onError;
    FlutterError.onError = (details) {
      errors.add(details);
    };

    await tester.pumpWidget(
      const GetMaterialApp(
        home: HomePage(),
      ),
    );
    await _settleFrames(tester);

    sitesService.remoteSites.assignAll([
      _site('bilibili', '哔哩哔哩'),
      _site('douyu', '斗鱼直播'),
      _site('huya', '虎牙直播'),
    ]);
    await _settleFrames(tester);

    FlutterError.onError = originalOnError;

    final buildPhaseErrors = errors.where((d) =>
        d.exception.toString().contains('setState() or markNeedsBuild()') ||
        d.exception.toString().contains('called during build'));
    expect(buildPhaseErrors, isEmpty,
        reason: '站点变化不应在 build 阶段触发 markNeedsBuild');
  });

  testWidgets('连续服务端切换后旧请求不覆盖新请求', (tester) async {
    final sitesService = SitesService.instance;
    sitesService.remoteSites.assignAll([_site('bilibili', '哔哩哔哩')]);

    final homeController = HomeController();
    Get.put<HomeController>(homeController);

    await tester.pumpWidget(
      const GetMaterialApp(
        home: HomePage(),
      ),
    );
    await _settleFrames(tester);

    sitesService.remoteSites.assignAll([_site('douyu', '斗鱼直播')]);
    await _settleFrames(tester);

    final douyuController = homeController.controllerFor('douyu');
    expect(douyuController, isNotNull);
    expect(homeController.sites.map((s) => s.id), ['douyu']);
    expect(homeController.controllerFor('douyu').site.id, 'douyu');
  });
}
