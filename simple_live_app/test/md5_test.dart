import 'package:flutter_test/flutter_test.dart';
import 'package:simple_live_app/core/scripts/js_runtime.dart';
import 'dart:io';

void main() {
  final src = File('assets/scripts/bilibili.js').readAsStringSync();
  test('md5 correctness', () {
    final js = JsEngine(memoryLimit: 16 * 1024 * 1024);
    js.eval(src);
    final h = js.eval('Md5.hex("test")') as String;
    expect(h, '098f6bcd4621d373cade4e832627b4f6');
    final h2 = js.eval('Md5.hex("abc")') as String;
    expect(h2, '900150983cd24fb0d6963f7d28e17f72');
    js.dispose();
  });
  test('full load + siteInfo', () {
    final js = JsEngine(memoryLimit: 16 * 1024 * 1024);
    js.eval(src);
    expect(js.hasFunction('getRecommendRooms'), true);
    final info = js.callGlobalJson('getSiteInfo', []);
    expect(info['id'], 'bilibili');
    js.dispose();
  });
}
