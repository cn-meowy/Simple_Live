import 'package:flutter_test/flutter_test.dart';
import 'package:simple_live_app/app/services/remote_live_api.dart';

void main() {
  group('RemoteLiveApi.resolveUrl', () {
    test('相对路径用 baseUrl 拼接', () {
      final api = RemoteLiveApi('http://192.168.1.10:8080');
      expect(
        api.resolveUrl('/api/v1/stream/hls/abc/play.m3u8'),
        'http://192.168.1.10:8080/api/v1/stream/hls/abc/play.m3u8',
      );
    });

    test('baseUrl 带尾斜杠时拼接结果无双斜杠', () {
      final api = RemoteLiveApi('http://192.168.1.10:8080/');
      expect(
        api.resolveUrl('/api/v1/stream/hls/abc/play.m3u8'),
        'http://192.168.1.10:8080/api/v1/stream/hls/abc/play.m3u8',
      );
    });

    test('http 绝对地址原样保留', () {
      final api = RemoteLiveApi('http://192.168.1.10:8080');
      const url = 'http://pull.example.com/live.flv';
      expect(api.resolveUrl(url), url);
    });

    test('https 绝对地址原样保留', () {
      final api = RemoteLiveApi('http://192.168.1.10:8080');
      const url = 'https://pull.example.com/live.m3u8';
      expect(api.resolveUrl(url), url);
    });

    test('非斜杠开头的无协议地址原样保留', () {
      final api = RemoteLiveApi('http://192.168.1.10:8080');
      const url = 'pull.example.com/live.flv';
      expect(api.resolveUrl(url), url);
    });
  });

  group('反序列化拼接相对路径封面/头像', () {
    final api = RemoteLiveApi('http://127.0.0.1:9090');
    const relCover = '/api/v1/stream/covers/HD.jpg';
    const absCover = 'https://i0.hdslive.com/xxx.jpg';

    test('LiveRoomItem.cover 相对路径拼接 baseUrl', () {
      final item = api.roomItemFromJson({
        'roomId': 'HD',
        'title': 't',
        'cover': relCover,
        'userName': 'u',
        'online': 1,
      });
      expect(
        item.cover,
        'http://127.0.0.1:9090/api/v1/stream/covers/HD.jpg',
      );
    });

    test('LiveRoomItem.cover 绝对地址原样保留', () {
      final item = api.roomItemFromJson({
        'roomId': 'HD',
        'title': 't',
        'cover': absCover,
        'userName': 'u',
      });
      expect(item.cover, absCover);
    });

    test('LiveSubCategory.pic 相对路径拼接 baseUrl', () {
      final sub = api.subCategoryFromJson({
        'id': '1',
        'name': 'n',
        'parentId': '0',
        'pic': relCover,
      });
      expect(
        sub.pic,
        'http://127.0.0.1:9090/api/v1/stream/covers/HD.jpg',
      );
    });

    test('LiveSubCategory.pic 缺省为空字符串', () {
      final sub = api.subCategoryFromJson({
        'id': '1',
        'name': 'n',
        'parentId': '0',
      });
      expect(sub.pic, '');
    });

    test('LiveAnchorItem.avatar 相对路径拼接 baseUrl', () {
      final anchor = api.anchorItemFromJson({
        'roomId': 'HD',
        'userName': 'u',
        'avatar': relCover,
        'liveStatus': true,
      });
      expect(
        anchor.avatar,
        'http://127.0.0.1:9090/api/v1/stream/covers/HD.jpg',
      );
    });

    test('LiveAnchorItem.avatar 绝对地址原样保留', () {
      final anchor = api.anchorItemFromJson({
        'roomId': 'HD',
        'userName': 'u',
        'avatar': absCover,
        'liveStatus': false,
      });
      expect(anchor.avatar, absCover);
    });

    test('LiveRoomDetail.cover 与 userAvatar 相对路径拼接 baseUrl', () {
      final detail = api.roomDetailFromJson({
        'roomId': 'HD',
        'title': 't',
        'cover': relCover,
        'userName': 'u',
        'userAvatar': relCover,
        'online': 0,
        'status': true,
        'url': 'x',
        'data': null,
        'danmakuData': null,
      }, 'bilibili');
      expect(
        detail.cover,
        'http://127.0.0.1:9090/api/v1/stream/covers/HD.jpg',
      );
      expect(
        detail.userAvatar,
        'http://127.0.0.1:9090/api/v1/stream/covers/HD.jpg',
      );
    });

    test('LiveRoomDetail.cover 与 userAvatar 绝对地址原样保留', () {
      final detail = api.roomDetailFromJson({
        'roomId': 'HD',
        'title': 't',
        'cover': absCover,
        'userName': 'u',
        'userAvatar': absCover,
        'online': 0,
        'status': true,
        'url': 'x',
        'data': null,
        'danmakuData': null,
      }, 'bilibili');
      expect(detail.cover, absCover);
      expect(detail.userAvatar, absCover);
    });

    test('空字符串封面/头像保持空字符串', () {
      final detail = api.roomDetailFromJson({
        'roomId': 'HD',
        'title': 't',
        'cover': '',
        'userName': 'u',
        'userAvatar': '',
        'online': 0,
        'status': true,
        'url': 'x',
        'data': null,
        'danmakuData': null,
      }, 'bilibili');
      expect(detail.cover, '');
      expect(detail.userAvatar, '');
    });
  });
}
