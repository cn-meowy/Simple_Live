import 'dart:convert';

import 'package:simple_live_app/core/danmaku/bilibili_danmaku.dart';
import 'package:simple_live_app/core/danmaku/douyin_danmaku.dart';
import 'package:simple_live_app/core/danmaku/huya_danmaku.dart';

/// LiveRoomDetail.danmakuData 的服务端 / 客户端编解码
///
/// 历史背景：在引入嵌入式 / 远端 HTTP 服务之前，`danmakuData` 在进程内
/// 直接持有 `BiliBiliDanmakuArgs` 等类型化 Args。Server 重构后该字段穿越
/// JSON wire，旧的 `toString()`（其内部 `json.encode(...)`）恰好导致
/// 写入的是 **JSON 字符串** 而非 Map，客户端 `_decodeDynamic` 透传回 String，
/// `args as BiliBiliDanmakuArgs` 抛 `type 'String' is not a subtype of ...`，
/// WebSocket 永远开不起来 —— 表现为“无弹幕 / 聊天栏静默”。
///
/// 本编解码以 `siteId` 为键把 Args 序列化为 Map，对称地恢复为 Args。
/// `douyu` 走原生房间号（String 透传），未内置的平台保持原值。
dynamic encodeDanmakuData(dynamic value, String siteId) {
  if (value == null) return null;
  if (value is String || value is num || value is bool) return value;
  if (value is List) return value;
  // 已经是 Map（ScriptLiveSite JS 直接返回 Map 的场景）—— 透传
  if (value is Map) return value;

  switch (siteId) {
    case 'bilibili':
      if (value is BiliBiliDanmakuArgs) {
        return <String, dynamic>{
          'roomId': value.roomId,
          'token': value.token,
          'buvid': value.buvid,
          'serverHost': value.serverHost,
          'uid': value.uid,
          'cookie': value.cookie,
        };
      }
      break;
    case 'douyin':
      if (value is DouyinDanmakuArgs) {
        return <String, dynamic>{
          'webRid': value.webRid,
          'roomId': value.roomId,
          'userId': value.userId,
          'cookie': value.cookie,
        };
      }
      break;
    case 'huya':
      if (value is HuyaDanmakuArgs) {
        return <String, dynamic>{
          'ayyuid': value.ayyuid,
          'topSid': value.topSid,
          'subSid': value.subSid,
        };
      }
      break;
    case 'douyu':
      // 斗鱼直接用 String roomId，无需编码
      return value;
  }

  // 未知 site / 类型：兜底为字符串，保持与历史 `_encodeDynamic` 一致
  return value.toString();
}

/// 把服务端返回的 danmakuData 还原为平台特定的 Args。
///
/// 接受：
/// - 已构造好的 Args 实例（进程内直接传）—— 原样返回
/// - `Map`（新 wire 格式）—— 按 siteId 重建
/// - `String`（旧 `toString()` 兜底产生的 JSON 字符串）—— 解析后再重建
/// - `null` —— `null`
/// - 其他 —— 原样返回（透传给上游）
dynamic decodeDanmakuData(dynamic value, String siteId) {
  if (value == null) return null;

  // 已经是类型化 Args —— 进程内直传场景
  if (value is BiliBiliDanmakuArgs ||
      value is DouyinDanmakuArgs ||
      value is HuyaDanmakuArgs) {
    return value;
  }

  // Map：按 siteId 重建
  if (value is Map) {
    return _decodeMap(value, siteId);
  }

  // String：可能是旧 toString() 产生的 JSON 字符串，尝试解析
  if (value is String) {
    try {
      final decoded = json.decode(value);
      if (decoded is Map) {
        return _decodeMap(decoded, siteId);
      }
    } catch (_) {
      // 非 JSON 字符串 —— 原样返回（斗鱼 roomId 也是合法 String）
    }
    return value;
  }

  // 其他类型 —— 透传
  return value;
}

dynamic _decodeMap(Map<dynamic, dynamic> m, String siteId) {
  switch (siteId) {
    case 'bilibili':
      return BiliBiliDanmakuArgs(
        roomId: (m['roomId'] as num?)?.toInt() ?? 0,
        token: m['token']?.toString() ?? '',
        buvid: m['buvid']?.toString() ?? '',
        serverHost: m['serverHost']?.toString() ?? '',
        uid: (m['uid'] as num?)?.toInt() ?? 0,
        cookie: m['cookie']?.toString() ?? '',
      );
    case 'douyin':
      return DouyinDanmakuArgs(
        webRid: m['webRid']?.toString() ?? '',
        roomId: m['roomId']?.toString() ?? '',
        userId: m['userId']?.toString() ?? '',
        cookie: m['cookie']?.toString() ?? '',
      );
    case 'huya':
      return HuyaDanmakuArgs(
        ayyuid: (m['ayyuid'] as num?)?.toInt() ?? 0,
        topSid: (m['topSid'] as num?)?.toInt() ?? 0,
        subSid: (m['subSid'] as num?)?.toInt() ?? 0,
      );
    default:
      // 未知 site：透传 Map
      return m;
  }
}
