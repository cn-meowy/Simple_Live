import 'package:flutter_test/flutter_test.dart';
import 'package:simple_live_app/core/common/core_error.dart';
import 'package:simple_live_app/core/scripts/js_runtime.dart';
import 'package:simple_live_app/core/script_live_site.dart';
import 'package:simple_live_app/core/model/live_room_item.dart';

void main() {
  group('JsEngine', () {
    test('eval 基本运算', () {
      final js = JsEngine();
      expect(js.eval('1 + 2'), 3);
      expect(js.eval('"hello"'), 'hello');
      expect(js.eval('true'), true);
      js.dispose();
    });

    test('callGlobalJson 返回对象', () {
      final js = JsEngine();
      js.eval('function foo() { return { a: 1, b: "x" }; }');
      final r = js.callGlobalJson('foo', []);
      expect(r, isA<Map>());
      expect((r as Map)['a'], 1);
      expect(r['b'], 'x');
      js.dispose();
    });

    test('hasFunction 判断', () {
      final js = JsEngine();
      js.eval('function bar() { return 1; }');
      expect(js.hasFunction('bar'), true);
      expect(js.hasFunction('nope'), false);
      js.dispose();
    });
  });

  group('ScriptLiveSite', () {
    test('无联网的纯计算站点能返回分类与推荐', () async {
      // 一个最小 JS 站点：getSiteInfo 返回 id/name，getCategores 返回数组，
      // getRecommendRooms 返回带 hasMore/items 的对象，无需联网。
      const source = r'''
function getSiteInfo() {
  return { id: "demo", name: "演示站", logo: "" };
}
function getCategores() {
  return [
    { id: "c1", name: "分类1", children: [
      { id: "s1", name: "子1", parentId: "c1", pic: "" }
    ] }
  ];
}
function getRecommendRooms(page) {
  return {
    hasMore: page < 2,
    items: [
      { roomId: "r" + page, title: "房间", cover: "", userName: "主播", online: 100 }
    ]
  };
}
function searchRooms(keyword, page) {
  return { hasMore: false, items: [] };
}
function searchAnchors(keyword, page) {
  return { hasMore: false, items: [] };
}
function getRoomDetail(roomId) {
  return { roomId: roomId, title: "t", cover: "", userName: "u", userAvatar: "", online: 1, status: true, url: "" };
}
function getLiveStatus(roomId) { return true; }
function getPlayQualites(detail) { return [ { quality: "原画", data: null, sort: 0 } ]; }
function getPlayUrls(detail, quality) { return { urls: ["http://x"], headers: {} }; }
function getSuperChatMessage(roomId) { return []; }
''';
      final site = ScriptLiveSite(jsSource: source);
      expect(site.id, 'demo');
      expect(site.name, '演示站');

      final cats = await site.getCategores();
      expect(cats.length, 1);
      expect(cats.first.name, '分类1');
      expect(cats.first.children.length, 1);

      final rec = await site.getRecommendRooms(page: 1);
      expect(rec.hasMore, true);
      expect(rec.items.length, 1);
      expect(rec.items.first.roomId, 'r1');
      expect(rec.items.first, isA<LiveRoomItem>());

      final rec2 = await site.getRecommendRooms(page: 2);
      expect(rec2.hasMore, false);

      final detail = await site.getRoomDetail(roomId: 'r1');
      expect(detail.roomId, 'r1');
      expect(detail.status, true);

      final qs = await site.getPlayQualites(detail: detail);
      expect(qs.length, 1);
      expect(qs.first.quality, '原画');

      final urls = await site.getPlayUrls(detail: detail, quality: qs.first);
      expect(urls.urls.length, 1);
      expect(urls.urls.first, 'http://x');

      final live = await site.getLiveStatus(roomId: 'r1');
      expect(live, true);

      site.dispose();
    });

    test('未实现函数抛 CoreError', () async {
      final site = ScriptLiveSite(
        jsSource: 'function getSiteInfo() { return { id: "x", name: "x", logo: "" }; }',
      );
      await expectLater(site.getCategores(), throwsA(isA<CoreError>()));
      site.dispose();
    });
  });
}
