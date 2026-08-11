import 'package:flutter_test/flutter_test.dart';
import 'package:simple_live_app/app/utils/server_url_util.dart';

void main() {
  group('ServerUrlUtil.normalize', () {
    test('保留合法 https URL 不变', () {
      expect(ServerUrlUtil.normalize('https://live.meowy.cn'),
          'https://live.meowy.cn');
    });

    test('保留合法 http URL 不变', () {
      expect(ServerUrlUtil.normalize('http://192.168.1.100:8089'),
          'http://192.168.1.100:8089');
    });

    test('trim 前后空白', () {
      expect(ServerUrlUtil.normalize('  https://x.com  '), 'https://x.com');
    });

    test('去除尾部斜杠避免拼接 //health', () {
      expect(ServerUrlUtil.normalize('http://192.168.1.100:8089/'),
          'http://192.168.1.100:8089');
    });

    test('去除多个尾部斜杠', () {
      expect(ServerUrlUtil.normalize('https://x.com///'), 'https://x.com');
    });

    test('缺 scheme 时自动补 https://', () {
      expect(ServerUrlUtil.normalize('live.meowy.cn'), 'https://live.meowy.cn');
    });

    test('缺 scheme 带端口时自动补 https://', () {
      expect(ServerUrlUtil.normalize('192.168.1.100:8089'),
          'https://192.168.1.100:8089');
    });

    test('缺 scheme 带尾斜杠时补 https:// 并去尾斜杠', () {
      expect(ServerUrlUtil.normalize('live.meowy.cn/'),
          'https://live.meowy.cn');
    });

    test('仅空白和斜杠的输入返回空字符串', () {
      expect(ServerUrlUtil.normalize('   /  '), '');
    });

    test('空字符串返回空字符串', () {
      expect(ServerUrlUtil.normalize(''), '');
    });

    test('iOS 键盘吞冒号场景：https//live.meowy.cn 修复为 https://live.meowy.cn', () {
      expect(ServerUrlUtil.normalize('https//live.meowy.cn'),
          'https://live.meowy.cn');
    });

    test('iOS 键盘吞冒号场景带尾斜杠：http//x.com/ 修复为 http://x.com', () {
      expect(ServerUrlUtil.normalize('http//x.com/'), 'http://x.com');
    });

    test('大写 scheme 规范为小写', () {
      expect(ServerUrlUtil.normalize('HTTPS://Live.Meowy.CN'),
          'https://Live.Meowy.CN');
    });

    test('非 http/https scheme 抛 ArgumentError', () {
      expect(() => ServerUrlUtil.normalize('ftp://x.com'),
          throwsA(isA<ArgumentError>()));
    });

    test('file scheme 抛 ArgumentError', () {
      expect(() => ServerUrlUtil.normalize('file:///etc/passwd'),
          throwsA(isA<ArgumentError>()));
    });
  });
}
