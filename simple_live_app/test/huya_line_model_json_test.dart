import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:simple_live_app/core/simple_live_core.dart';

/// 虎牙模型类 JSON 序列化往返测试。
///
/// 覆盖回归场景：内嵌 shelf 服务在 `GET .../qualities` 时对包含
/// `HuyaLineModel` 实例的 Map 执行 `json.encode`，此前因模型无 `toJson`
/// 而抛 "Converting object to an encodable object failed: Instance of
/// 'HuyaLineModel'"（HTTP 500）。本测试验证修复后的往返正确性。
void main() {
  group('HuyaLineModel.toJson', () {
    test('产出包含全部 8 个字段且 lineType 为枚举名', () {
      final line = _sampleLine();
      final json = line.toJson();

      expect(json.keys, containsAll(<String>[
        'line',
        'cdnType',
        'flvAntiCode',
        'hlsAntiCode',
        'streamName',
        'lineType',
        'bitRate',
        'presenterUid',
      ]));
      expect(json['lineType'], 'flv');
      expect(json['bitRate'], 2000);
      expect(json['presenterUid'], 12345);
    });

    test('包含 HuyaLineModel 的 Map 可被 json.encode 成功序列化', () {
      // 复刻 bug 报告中的失败路径：quality.data = {urls, bitRate}，
      // 其中 urls 是 List<HuyaLineModel>。修复前 json.encode 在此处崩溃。
      final data = {
        'urls': <HuyaLineModel>[_sampleLine()],
        'bitRate': 2000,
      };

      // 不应抛出 "Converting object to an encodable object failed"
      final encoded = json.encode({
        'urls': (data['urls'] as List).map((u) => (u as HuyaLineModel).toJson()).toList(),
        'bitRate': data['bitRate'],
      });

      final decoded = json.decode(encoded) as Map<String, dynamic>;
      expect(decoded['bitRate'], 2000);
      expect((decoded['urls'] as List).length, 1);
    });
  });

  group('HuyaLineModel.fromJson', () {
    test('与 toJson 往返后字段全部相等', () {
      final original = _sampleLine();
      final roundTripped = HuyaLineModel.fromJson(original.toJson());

      expect(roundTripped.line, original.line);
      expect(roundTripped.cdnType, original.cdnType);
      expect(roundTripped.flvAntiCode, original.flvAntiCode);
      expect(roundTripped.hlsAntiCode, original.hlsAntiCode);
      expect(roundTripped.streamName, original.streamName);
      expect(roundTripped.lineType, original.lineType);
      expect(roundTripped.bitRate, original.bitRate);
      expect(roundTripped.presenterUid, original.presenterUid);
    });

    test('兼容旧式 lineType 形态 HuyaLineType.hls', () {
      // Node 服务端 _encodeDynamic 的 toString 兜底可能产出
      // "HuyaLineType.hls"，fromJson 需能解析。
      final json = _sampleLine().toJson()..['lineType'] = 'HuyaLineType.hls';
      final line = HuyaLineModel.fromJson(json);

      expect(line.lineType, HuyaLineType.hls);
    });

    test('bitRate/presenterUid 缺失时回退为 0（向前兼容旧 payload）', () {
      final json = _sampleLine().toJson()
        ..remove('bitRate')
        ..remove('presenterUid');
      final line = HuyaLineModel.fromJson(json);

      expect(line.bitRate, 0);
      expect(line.presenterUid, 0);
    });

    test('未知 lineType 抛 FormatException', () {
      final json = _sampleLine().toJson()..['lineType'] = 'unknown';
      expect(() => HuyaLineModel.fromJson(json), throwsA(isA<FormatException>()));
    });
  });

  group('HuyaBitRateModel', () {
    test('toJson/fromJson 往返相等', () {
      final original = HuyaBitRateModel(name: '原画', bitRate: 0);
      final roundTripped = HuyaBitRateModel.fromJson(original.toJson());

      expect(roundTripped.name, original.name);
      expect(roundTripped.bitRate, original.bitRate);
    });
  });

  group('HuyaUrlDataModel', () {
    test('toJson/fromJson 往返后 lines/bitRates 数量与字段一致', () {
      final original = HuyaUrlDataModel(
        url: 'https://example.com/live/123',
        uid: '123',
        lines: [_sampleLine()],
        bitRates: [HuyaBitRateModel(name: '原画', bitRate: 0)],
      );
      final roundTripped = HuyaUrlDataModel.fromJson(original.toJson());

      expect(roundTripped.url, original.url);
      expect(roundTripped.uid, original.uid);
      expect(roundTripped.lines.length, 1);
      expect(roundTripped.lines.first.line, original.lines.first.line);
      expect(roundTripped.lines.first.lineType, HuyaLineType.flv);
      expect(roundTripped.bitRates.length, 1);
      expect(roundTripped.bitRates.first.name, '原画');
    });
  });
}

HuyaLineModel _sampleLine() {
  return HuyaLineModel(
    line: 'hy-线路1',
    lineType: HuyaLineType.flv,
    flvAntiCode: 'flvAntiCodeValue',
    hlsAntiCode: 'hlsAntiCodeValue',
    streamName: '12345.stream',
    cdnType: 'AL',
    bitRate: 2000,
    presenterUid: 12345,
  );
}
