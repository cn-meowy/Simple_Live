import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:simple_live_app/app/controller/base_controller.dart';
import 'package:simple_live_app/widgets/page_grid_view.dart';

class ControlledPageController extends BasePageController<int> {
  final List<Completer<List<int>>> requests = [];

  @override
  Future<List<int>> getData(int page, int pageSize) {
    final completer = Completer<List<int>>();
    requests.add(completer);
    return completer.future;
  }
}

void main() {
  setUp(() {
    WidgetsFlutterBinding.ensureInitialized();
  });

  tearDown(() {
    Get.reset();
  });

  group('BasePageController 请求序号隔离', () {
    test('较旧的刷新响应不能覆盖较新的刷新结果', () async {
      final controller = ControlledPageController();
      final first = controller.refreshData();
      final second = controller.refreshData();

      controller.requests[1].complete([2]);
      await second;
      controller.requests[0].complete([1]);
      await first;

      expect(controller.list, [2]);
      expect(controller.pageEmpty.value, isFalse);
      expect(controller.pageError.value, isFalse);
      expect(controller.pageLoadding.value, isFalse);
    });

    test('旧失败不覆盖新成功', () async {
      final controller = ControlledPageController();
      final first = controller.refreshData();
      final second = controller.refreshData();

      controller.requests[1].complete([2]);
      await second;
      controller.requests[0].completeError(StateError('old server'));
      await first;

      expect(controller.list, [2]);
      expect(controller.pageError.value, isFalse);
    });

    test('空结果可再次刷新', () async {
      final controller = ControlledPageController();
      final first = controller.refreshData();

      controller.requests[0].complete([]);
      await first;

      expect(controller.pageEmpty.value, isTrue);
      expect(controller.list, []);

      final second = controller.refreshData();
      controller.requests[1].complete([3]);
      await second;

      expect(controller.pageEmpty.value, isFalse);
      expect(controller.list, [3]);
    });

    test('disposePageController 幂等且不抛异常', () {
      final controller = ControlledPageController();
      controller.disposePageController();
      controller.disposePageController();
    });
  });

  group('PageGridView 空态点击刷新', () {
    testWidgets('空态点击后重新请求成功渲染数据', (tester) async {
      final controller = ControlledPageController();

      final errors = <FlutterErrorDetails>[];
      final originalOnError = FlutterError.onError;
      FlutterError.onError = (details) {
        errors.add(details);
      };

      await tester.pumpWidget(
        GetMaterialApp(
          home: Scaffold(
            body: PageGridView(
              pageController: controller,
              crossAxisCount: 2,
              itemBuilder: (_, i) => Text('item-${controller.list[i]}'),
            ),
          ),
        ),
      );

      controller.refreshData();
      await tester.pump();
      controller.requests[0].complete([]);
      await tester.pump();

      expect(controller.pageEmpty.value, isTrue);
      expect(find.text('这里什么都没有'), findsOneWidget);

      await tester.tap(find.text('这里什么都没有'));
      await tester.pump();

      controller.requests[1].complete([9]);
      await tester.pump();

      expect(find.text('item-9'), findsOneWidget);

      FlutterError.onError = originalOnError;

      final buildPhaseErrors = errors.where((d) =>
          d.exception.toString().contains('setState() or markNeedsBuild()') ||
          d.exception.toString().contains('called during build'));
      expect(buildPhaseErrors, isEmpty,
          reason: '空态点击刷新不应在 build 阶段触发 markNeedsBuild');

      controller.disposePageController();
    });
  });
}
