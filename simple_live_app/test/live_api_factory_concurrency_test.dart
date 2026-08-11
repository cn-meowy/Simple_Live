import 'package:flutter_test/flutter_test.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/app/services/live_api_service.dart';
import 'package:simple_live_app/app/services/remote_live_api.dart';

/// 验证 reset() 后并发 instanceAsync 调用只创建一次实例（Completer 互斥）。
///
/// 根因：HEAD 版 instanceAsync 无互斥，reset() 后多个并发调用各自进入
/// _createInstanceAsync，在 _instance 赋值前都判定为 null，导致创建多个
/// 实例、部分调用方拿到旧地址的实例。
void main() {
  // 每个测试前确保工厂处于干净状态（无缓存实例、无 override）
  setUp(() {
    LiveApiFactory.reset();
    LiveApiFactory.restoreCreateInstance();
  });

  tearDown(() {
    LiveApiFactory.reset();
    LiveApiFactory.restoreCreateInstance();
  });

  group('LiveApiFactory.instanceAsync 并发互斥', () {
    test('reset 后并发调用只创建一次实例且返回同一对象', () async {
      var createCount = 0;
      LiveApiFactory.overrideCreateInstance(() async {
        createCount++;
        // 模拟异步创建（启动内嵌服务等），让并发调用有机会交错
        await Future.delayed(const Duration(milliseconds: 50));
        return RemoteLiveApi('http://concurrent.test');
      });

      final results = await Future.wait([
        LiveApiFactory.instanceAsync,
        LiveApiFactory.instanceAsync,
        LiveApiFactory.instanceAsync,
        LiveApiFactory.instanceAsync,
        LiveApiFactory.instanceAsync,
      ]);

      expect(createCount, 1, reason: '并发调用应只触发一次创建');
      for (final api in results) {
        expect(identical(api, results.first), isTrue,
            reason: '所有并发调用应返回同一个实例对象');
      }
    });

    test('实例缓存后再次调用不重新创建', () async {
      var createCount = 0;
      LiveApiFactory.overrideCreateInstance(() async {
        createCount++;
        return RemoteLiveApi('http://cache.test');
      });

      final first = await LiveApiFactory.instanceAsync;
      final second = await LiveApiFactory.instanceAsync;
      final third = await LiveApiFactory.instanceAsync;

      expect(createCount, 1);
      expect(identical(first, second), isTrue);
      expect(identical(second, third), isTrue);
    });

    test('reset 后重新创建新实例', () async {
      var createCount = 0;
      LiveApiFactory.overrideCreateInstance(() async {
        createCount++;
        return RemoteLiveApi('http://reset-$createCount.test');
      });

      final first = await LiveApiFactory.instanceAsync;
      LiveApiFactory.reset();
      final second = await LiveApiFactory.instanceAsync;

      expect(createCount, 2);
      expect(identical(first, second), isFalse,
          reason: 'reset 后应创建全新的实例');
    });

    test('创建抛错时不缓存失败状态，后续调用可重试', () async {
      var createCount = 0;
      LiveApiFactory.overrideCreateInstance(() async {
        createCount++;
        if (createCount == 1) {
          throw StateError('首次创建失败');
        }
        return RemoteLiveApi('http://retry.test');
      });

      // 首次：抛错
      await expectLater(
        LiveApiFactory.instanceAsync,
        throwsA(isA<StateError>()),
      );
      // 互斥锁应已释放，Completer 已清理
      // 二次：重试成功
      final api = await LiveApiFactory.instanceAsync;
      expect(api, isA<LiveApiService>());
      expect(createCount, 2);
    });

    test('并发调用中创建失败时所有调用方都收到错误', () async {
      var createCount = 0;
      LiveApiFactory.overrideCreateInstance(() async {
        createCount++;
        await Future.delayed(const Duration(milliseconds: 30));
        throw StateError('并发创建失败');
      });

      final futures = [
        LiveApiFactory.instanceAsync,
        LiveApiFactory.instanceAsync,
        LiveApiFactory.instanceAsync,
      ];

      for (final f in futures) {
        await expectLater(f, throwsA(isA<StateError>()));
      }
      expect(createCount, 1, reason: '失败也只应尝试创建一次');
      // 失败后锁释放，实例未缓存
      LiveApiFactory.restoreCreateInstance();
      LiveApiFactory.overrideCreateInstance(() async {
        return RemoteLiveApi('http://recover.test');
      });
      final recovered = await LiveApiFactory.instanceAsync;
      expect(recovered, isA<LiveApiService>());
    });
  });
}
