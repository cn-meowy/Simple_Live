import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:simple_live_app/app/services/embedded_live_server.dart';
import 'package:simple_live_app/app/sites.dart';

/// 嵌入式服务端点测试（sites + cookie 端点）。
///
/// 启动 [EmbeddedLiveServer] 绑定到 127.0.0.1:0（系统分配端口），
/// 通过 dart:io HttpClient 访问端点并校验响应结构与 Cookie 读写流程。
///
/// 注：QR generate/poll 端点会真实调用 B 站 passport 接口，需要外网；
/// 本测试仅覆盖不需要外网的部分。
void main() {
  setUpAll(() {
    Sites.reload();
  });

  setUp(() async {
    await EmbeddedLiveServer.instance.stop();
  });

  tearDown(() async {
    await EmbeddedLiveServer.instance.stop();
  });

  Uri uri(String path) {
    final port = EmbeddedLiveServer.instance.baseUrl!.split(':').last;
    return Uri.parse('http://127.0.0.1:$port$path');
  }

  Future<HttpClientResponse> doGet(String path) async {
    final client = HttpClient();
    try {
      final req = await client.getUrl(uri(path));
      final resp = await req.close();
      final body = await resp.transform(utf8.decoder).join();
      return HttpClientResponse(resp.statusCode, body);
    } finally {
      client.close(force: true);
    }
  }

  Future<HttpClientResponse> doPut(String path, String body) async {
    final client = HttpClient();
    try {
      final req = await client.putUrl(uri(path));
      req.headers.contentType = ContentType.json;
      req.headers.contentLength = utf8.encode(body).length;
      req.add(utf8.encode(body));
      final resp = await req.close();
      final respBody = await resp.transform(utf8.decoder).join();
      return HttpClientResponse(resp.statusCode, respBody);
    } finally {
      client.close(force: true);
    }
  }

  Future<HttpClientResponse> doDelete(String path) async {
    final client = HttpClient();
    try {
      final req = await client.deleteUrl(uri(path));
      final resp = await req.close();
      final body = await resp.transform(utf8.decoder).join();
      return HttpClientResponse(resp.statusCode, body);
    } finally {
      client.close(force: true);
    }
  }

  group('EmbeddedLiveServer GET /api/v1/sites', () {
    test('返回 account 描述符：bilibili=qr，douyin=cookie，其他无', () async {
      await EmbeddedLiveServer.instance.start(host: '127.0.0.1', port: 0);
      final resp = await doGet('/api/v1/sites');
      expect(resp.statusCode, 200);

      final body = json.decode(resp.body) as Map<String, dynamic>;
      expect(body['code'], 0);
      final list = (body['data'] as List).cast<Map<String, dynamic>>();

      final byId = {for (final s in list) s['id'] as String: s};

      // bilibili -> qr
      expect(byId.containsKey('bilibili'), isTrue);
      final bili = byId['bilibili']!;
      expect(bili['name'], '哔哩哔哩');
      expect(bili['account'], isA<Map>());
      expect(bili['account']['type'], 'qr');
      expect(bili['account']['label'], '扫码登录');

      // douyin -> cookie
      expect(byId.containsKey('douyin'), isTrue);
      final dy = byId['douyin']!;
      expect(dy['account'], isA<Map>());
      expect(dy['account']['type'], 'cookie');

      // douyu / huya -> 无 account 字段
      expect(byId.containsKey('douyu'), isTrue);
      expect((byId['douyu']!).containsKey('account'), isFalse,
          reason: 'douyu 不应输出 account 字段');

      expect(byId.containsKey('huya'), isTrue);
      expect((byId['huya']!).containsKey('account'), isFalse,
          reason: 'huya 不应输出 account 字段');

      // local 平台不暴露
      expect(byId.containsKey('local'), isFalse);
    });
  });

  group('EmbeddedLiveServer Cookie 端点', () {
    test('PUT -> GET 写入读取，DELETE 清空', () async {
      await EmbeddedLiveServer.instance.start(host: '127.0.0.1', port: 0);

      // 初始 GET -> cookie 为空
      var resp = await doGet('/api/v1/cookie/test_site');
      expect(resp.statusCode, 200);
      expect((json.decode(resp.body) as Map)['data']['cookie'], '');

      // PUT cookie
      const cookieValue = 'a=1; b=2';
      resp = await doPut(
        '/api/v1/cookie/test_site',
        json.encode({'cookie': cookieValue}),
      );
      expect(resp.statusCode, 200);
      final putBody = json.decode(resp.body) as Map;
      expect(putBody['data']['siteId'], 'test_site');
      expect(putBody['data']['cookie'], cookieValue);

      // GET 读回
      resp = await doGet('/api/v1/cookie/test_site');
      expect(resp.statusCode, 200);
      expect((json.decode(resp.body) as Map)['data']['cookie'], cookieValue);

      // DELETE
      resp = await doDelete('/api/v1/cookie/test_site');
      expect(resp.statusCode, 200);
      expect((json.decode(resp.body) as Map)['data']['deleted'], true);

      // GET 应为空
      resp = await doGet('/api/v1/cookie/test_site');
      expect(resp.statusCode, 200);
      expect((json.decode(resp.body) as Map)['data']['cookie'], '');
    });

    test('PUT 请求体缺 cookie 字段返回 400', () async {
      await EmbeddedLiveServer.instance.start(host: '127.0.0.1', port: 0);

      final resp = await doPut(
        '/api/v1/cookie/test_site',
        json.encode({}),
      );
      expect(resp.statusCode, 400);
    });
  });
}

/// 简单的 HTTP 响应包装，避免引入 http 包。
class HttpClientResponse {
  final int statusCode;
  final String body;
  HttpClientResponse(this.statusCode, this.body);
}