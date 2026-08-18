import 'package:flutter_test/flutter_test.dart';
import 'package:simple_live_app/app/services/danmaku_data_codec.dart';
import 'package:simple_live_app/core/danmaku/bilibili_danmaku.dart';
import 'package:simple_live_app/core/danmaku/douyin_danmaku.dart';
import 'package:simple_live_app/core/danmaku/huya_danmaku.dart';

void main() {
  group('encodeDanmakuData', () {
    test('null 透传', () {
      expect(encodeDanmakuData(null, 'bilibili'), isNull);
    });

    test('基本类型透传', () {
      expect(encodeDanmakuData('abc', 'douyu'), 'abc');
      expect(encodeDanmakuData(42, 'bilibili'), 42);
      expect(encodeDanmakuData(true, 'huya'), true);
      expect(encodeDanmakuData([1, 2, 3], 'bilibili'), [1, 2, 3]);
    });

    test('Map 透传（ScriptLiveSite JS 直接返回 Map 的场景）', () {
      final m = <String, dynamic>{'roomId': 1, 'token': 't'};
      expect(encodeDanmakuData(m, 'bilibili'), same(m));
    });

    test('BiliBiliDanmakuArgs -> Map', () {
      final args = BiliBiliDanmakuArgs(
        roomId: 123,
        token: 'tok',
        buvid: 'bv',
        serverHost: 'example.com',
        uid: 99,
        cookie: 'ck',
      );
      expect(encodeDanmakuData(args, 'bilibili'), {
        'roomId': 123,
        'token': 'tok',
        'buvid': 'bv',
        'serverHost': 'example.com',
        'uid': 99,
        'cookie': 'ck',
      });
    });

    test('DouyinDanmakuArgs -> Map', () {
      final args = DouyinDanmakuArgs(
        webRid: 'wr',
        roomId: 'rm',
        userId: 'uid',
        cookie: 'ck',
      );
      expect(encodeDanmakuData(args, 'douyin'), {
        'webRid': 'wr',
        'roomId': 'rm',
        'userId': 'uid',
        'cookie': 'ck',
      });
    });

    test('HuyaDanmakuArgs -> Map', () {
      final args = HuyaDanmakuArgs(ayyuid: 1, topSid: 2, subSid: 3);
      expect(encodeDanmakuData(args, 'huya'), {
        'ayyuid': 1,
        'topSid': 2,
        'subSid': 3,
      });
    });

    test('siteId 不匹配时未知类型 fallback toString', () {
      final args = BiliBiliDanmakuArgs(
        roomId: 1,
        token: 't',
        buvid: 'b',
        serverHost: 's',
        uid: 0,
        cookie: '',
      );
      // 错配 siteId：siteId=huya 时，bilibili 的 Args 不命中分支 -> toString
      final encoded = encodeDanmakuData(args, 'huya');
      expect(encoded, isA<String>());
    });

    test('douyu 透传任意值（roomId String）', () {
      expect(encodeDanmakuData('123456', 'douyu'), '123456');
    });
  });

  group('decodeDanmakuData', () {
    test('null 透传', () {
      expect(decodeDanmakuData(null, 'bilibili'), isNull);
    });

    test('已构造好的 Args 实例原样返回', () {
      final args = BiliBiliDanmakuArgs(
        roomId: 1,
        token: 't',
        buvid: 'b',
        serverHost: 's',
        uid: 0,
        cookie: '',
      );
      expect(decodeDanmakuData(args, 'bilibili'), same(args));
    });

    test('Map -> BiliBiliDanmakuArgs', () {
      final decoded = decodeDanmakuData(<String, dynamic>{
        'roomId': 10,
        'token': 'tok',
        'buvid': 'bv',
        'serverHost': 'h',
        'uid': 7,
        'cookie': 'c',
      }, 'bilibili');
      expect(decoded, isA<BiliBiliDanmakuArgs>());
      final a = decoded as BiliBiliDanmakuArgs;
      expect(a.roomId, 10);
      expect(a.token, 'tok');
      expect(a.buvid, 'bv');
      expect(a.serverHost, 'h');
      expect(a.uid, 7);
      expect(a.cookie, 'c');
    });

    test('Map -> DouyinDanmakuArgs', () {
      final decoded = decodeDanmakuData(<String, dynamic>{
        'webRid': 'w',
        'roomId': 'r',
        'userId': 'u',
        'cookie': 'c',
      }, 'douyin');
      expect(decoded, isA<DouyinDanmakuArgs>());
      final a = decoded as DouyinDanmakuArgs;
      expect(a.webRid, 'w');
      expect(a.roomId, 'r');
      expect(a.userId, 'u');
      expect(a.cookie, 'c');
    });

    test('Map -> HuyaDanmakuArgs', () {
      final decoded = decodeDanmakuData(<String, dynamic>{
        'ayyuid': 1,
        'topSid': 2,
        'subSid': 3,
      }, 'huya');
      expect(decoded, isA<HuyaDanmakuArgs>());
      final a = decoded as HuyaDanmakuArgs;
      expect(a.ayyuid, 1);
      expect(a.topSid, 2);
      expect(a.subSid, 3);
    });

    test('Map 缺字段时用安全默认值', () {
      final decoded = decodeDanmakuData(<String, dynamic>{}, 'bilibili')
          as BiliBiliDanmakuArgs;
      expect(decoded.roomId, 0);
      expect(decoded.token, '');
      expect(decoded.buvid, '');
      expect(decoded.serverHost, '');
      expect(decoded.uid, 0);
      expect(decoded.cookie, '');
    });

    test('legacy 字符串（JSON 编码 Map）-> Args', () {
      const legacy =
          '{"roomId":1,"token":"t","buvid":"b","serverHost":"s","uid":0,"cookie":""}';
      final decoded = decodeDanmakuData(legacy, 'bilibili');
      expect(decoded, isA<BiliBiliDanmakuArgs>());
      expect((decoded as BiliBiliDanmakuArgs).roomId, 1);
    });

    test('非 JSON 字符串透传（douyu roomId）', () {
      expect(decodeDanmakuData('12345', 'douyu'), '12345');
    });

    test('无效 JSON 字符串透传', () {
      expect(decodeDanmakuData('{bad json', 'bilibili'), '{bad json');
    });

    test('未知 siteId: Map 透传', () {
      final m = <String, dynamic>{'foo': 'bar'};
      expect(decodeDanmakuData(m, 'unknown'), same(m));
    });
  });

  group('round-trip', () {
    test('bilibili Args encode -> decode 等价', () {
      final args = BiliBiliDanmakuArgs(
        roomId: 999,
        token: 'tok',
        buvid: 'bv',
        serverHost: 'host',
        uid: 42,
        cookie: 'c',
      );
      final wire = encodeDanmakuData(args, 'bilibili');
      expect(wire, isA<Map>());
      final restored = decodeDanmakuData(wire, 'bilibili');
      expect(restored, isA<BiliBiliDanmakuArgs>());
      expect((restored as BiliBiliDanmakuArgs).roomId, 999);
      expect(restored.token, 'tok');
      expect(restored.buvid, 'bv');
      expect(restored.serverHost, 'host');
      expect(restored.uid, 42);
      expect(restored.cookie, 'c');
    });

    test('douyin Args encode -> decode 等价', () {
      final args = DouyinDanmakuArgs(
        webRid: 'wr',
        roomId: 'rm',
        userId: 'uid',
        cookie: 'c',
      );
      final restored =
          decodeDanmakuData(encodeDanmakuData(args, 'douyin'), 'douyin');
      expect(restored, isA<DouyinDanmakuArgs>());
      expect((restored as DouyinDanmakuArgs).webRid, 'wr');
      expect(restored.roomId, 'rm');
      expect(restored.userId, 'uid');
      expect(restored.cookie, 'c');
    });

    test('huya Args encode -> decode 等价', () {
      final args = HuyaDanmakuArgs(ayyuid: 1, topSid: 2, subSid: 3);
      final restored =
          decodeDanmakuData(encodeDanmakuData(args, 'huya'), 'huya');
      expect(restored, isA<HuyaDanmakuArgs>());
      final h = restored as HuyaDanmakuArgs;
      expect(h.ayyuid, 1);
      expect(h.topSid, 2);
      expect(h.subSid, 3);
    });
  });
}
