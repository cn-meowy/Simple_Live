import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:simple_live_app/requests/redirect_interceptor.dart';

void main() {
  group('RedirectInterceptor', () {
    late HttpServer server;
    late String host;

    setUp(() async {
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      host = 'http://${server.address.address}:${server.port}';
    });

    tearDown(() async {
      await server.close(force: true);
    });

    Dio buildDio() {
      final dio = Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 5),
        followRedirects: false,
      ));
      dio.interceptors.add(RedirectInterceptor(dio));
      return dio;
    }

    test('跟随 http 301 重定向（POST 保持方法与请求体）', () async {
      String? receivedMethod;
      String? receivedBody;
      server.listen((request) async {
        if (request.uri.path == '/start') {
          receivedMethod = request.method;
          final bytes = <int>[];
          await for (final chunk in request) {
            bytes.addAll(chunk);
          }
          receivedBody = utf8.decode(bytes);
          request.response
            ..statusCode = 301
            ..headers.set('location', '$host/target');
          await request.response.close();
        } else {
          receivedMethod = request.method;
          final bytes = <int>[];
          await for (final chunk in request) {
            bytes.addAll(chunk);
          }
          receivedBody = utf8.decode(bytes);
          request.response
            ..statusCode = 200
            ..write('ok');
          await request.response.close();
        }
      });

      final dio = buildDio();
      final resp = await dio.post(
        '$host/start',
        data: {'a': 1},
        options: Options(responseType: ResponseType.plain),
      );

      expect(resp.statusCode, 200);
      // 重定向后仍为 POST，请求体被重放
      expect(receivedMethod, 'POST');
      expect(receivedBody, isNotEmpty);
      dio.close();
    });

    test('跟随 GET 301 重定向', () async {
      server.listen((request) async {
        if (request.uri.path == '/start') {
          request.response
            ..statusCode = 301
            ..headers.set('location', '$host/target');
        } else {
          request.response
            ..statusCode = 200
            ..write('ok');
        }
        await request.response.close();
      });

      final dio = buildDio();
      final resp = await dio.get(
        '$host/start',
        options: Options(responseType: ResponseType.plain),
      );
      expect(resp.statusCode, 200);
      dio.close();
    });

    test('非 3xx 错误透传不重定向', () async {
      server.listen((request) async {
        request.response
          ..statusCode = 500
          ..write('err');
        await request.response.close();
      });

      final dio = buildDio();
      expect(
        () => dio.get('$host/start', options: Options(responseType: ResponseType.plain)),
        throwsA(isA<DioException>()),
      );
      dio.close();
    });

    test('相对路径 Location 正确解析', () async {
      server.listen((request) async {
        if (request.uri.path == '/start') {
          request.response
            ..statusCode = 302
            ..headers.set('location', '/target');
        } else {
          request.response
            ..statusCode = 200
            ..write('ok');
        }
        await request.response.close();
      });

      final dio = buildDio();
      final resp = await dio.get(
        '$host/start',
        options: Options(responseType: ResponseType.plain),
      );
      expect(resp.statusCode, 200);
      dio.close();
    });
  });
}
