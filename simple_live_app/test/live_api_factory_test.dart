import 'package:flutter_test/flutter_test.dart';
import 'package:simple_live_app/app/constant.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_app/core/simple_live_core.dart';

void main() {
  // 确保 allSites 包含内置站点（含 local）。
  // reload() 内部对 ScriptSiteService 做了 try/catch，无 GetX 环境下也能安全调用。
  setUpAll(() {
    Sites.reload();
  });

  group('LiveApiFactory.getDanmaku', () {
    test('local 平台返回非空 no-op LiveDanmaku', () {
      final danmaku = LiveApiFactory.getDanmaku(Constant.kLocal);
      expect(danmaku, isNotNull);
      expect(danmaku, isA<LiveDanmaku>());
      // no-op 实现：start/stop 不抛异常
      expect(() => danmaku.start(null), returnsNormally);
      expect(() => danmaku.stop(), returnsNormally);
    });

    test('未知平台软降级返回 no-op LiveDanmaku 而非抛错', () {
      final danmaku = LiveApiFactory.getDanmaku('unknown_platform_xyz');
      expect(danmaku, isNotNull);
      expect(danmaku, isA<LiveDanmaku>());
      expect(() => danmaku.start(null), returnsNormally);
      expect(() => danmaku.stop(), returnsNormally);
    });

    test('内置平台返回各自的真实弹幕处理器', () {
      final bili = LiveApiFactory.getDanmaku(Constant.kBiliBili);
      expect(bili, isA<LiveDanmaku>());
      // BiliBiliDanmaku 是 LiveDanmaku 子类
      expect(bili.runtimeType.toString(), contains('BiliBili'));
    });
  });

  group('Sites.allSites', () {
    test('包含 local 平台且 liveSite 非空', () {
      expect(Sites.allSites.containsKey(Constant.kLocal), isTrue);
      final site = Sites.allSites[Constant.kLocal]!;
      expect(site.id, Constant.kLocal);
      expect(site.liveSite, isNotNull);
    });

    test('local 平台的 getDanmaku 返回默认 LiveDanmaku', () {
      final site = Sites.allSites[Constant.kLocal]!;
      final danmaku = site.liveSite!.getDanmaku();
      expect(danmaku, isA<LiveDanmaku>());
      // 默认 LiveDanmaku 不应是任何平台子类
      expect(danmaku.runtimeType, LiveDanmaku);
    });
  });
}
