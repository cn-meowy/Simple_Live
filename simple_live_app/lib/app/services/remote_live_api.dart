import 'package:flutter/foundation.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_app/requests/http_client.dart';
import 'package:simple_live_app/core/simple_live_core.dart';

import 'live_api_service.dart';

/// 远程 LiveApi 实现
///
/// 调用服务端 HTTP 接口，当服务端启用且可用时使用此实现。
/// JSON 反序列化复用服务端已有的 JSON 结构。
class RemoteLiveApi implements LiveApiService {
  final String baseUrl;

  RemoteLiveApi(this.baseUrl);

  @override
  Future<List<Map<String, dynamic>>> getSites() async {
    final result = await _getJson('/api/v1/sites');
    final list = result['data'] as List<dynamic>;
    return list.map((e) {
      final m = e as Map<String, dynamic>;
      return <String, dynamic>{
        'id': m['id']?.toString() ?? '',
        'name': m['name']?.toString() ?? '',
        // 同时透传 account 描述符（sites_service 会解析为 SiteAccountDescriptor）
        if (m['account'] != null) 'account': m['account'],
      };
    }).toList();
  }

  /// 生成扫码登录二维码（仅支持 siteId == 'bilibili'）
  Future<({String qrcodeKey, String qrImageBase64})> generateSiteQR(
    String siteId,
  ) async {
    final result = await _postJson(
      '/api/v1/sites/$siteId/account/qr/generate',
    );
    final data = result['data'] as Map<String, dynamic>;
    return (
      qrcodeKey: data['qrcodeKey'] as String,
      qrImageBase64: data['qrImageBase64'] as String,
    );
  }

  /// 轮询扫码登录状态
  ///
  /// 返回 status: unscanned | scanned | confirmed | expired
  Future<({String status, String? cookie})> pollSiteQR(
    String siteId,
    String qrcodeKey,
  ) async {
    final result = await _getJson(
      '/api/v1/sites/$siteId/account/qr/poll?qrcodeKey=$qrcodeKey',
    );
    final data = result['data'] as Map<String, dynamic>;
    return (
      status: data['status'] as String,
      cookie: data['cookie'] as String?,
    );
  }

  /// 读取指定站点的用户名
  Future<String?> getSiteUsername(String siteId) async {
    final result = await _getJson('/api/v1/sites/$siteId/account/username');
    final data = result['data'] as Map<String, dynamic>;
    final username = data['username'] as String? ?? '';
    return username.isEmpty ? null : username;
  }

  /// 写入指定站点的用户名
  Future<void> setSiteUsername(String siteId, String username) async {
    await _postJson(
      '/api/v1/sites/$siteId/account/username',
      data: {'username': username},
    );
  }

  /// 删除指定站点的用户名
  Future<void> deleteSiteUsername(String siteId) async {
    await HttpClient.instance.dio.delete(
      '$baseUrl/api/v1/sites/$siteId/account/username',
    );
  }

  @override
  Future<List<LiveCategory>> getCategores(String siteId) async {
    final result = await _getJson('/api/v1/sites/$siteId/categories');
    final list = result['data'] as List<dynamic>;
    return list.map((e) => _categoryFromJson(e as Map<String, dynamic>)).toList();
  }

  @override
  Future<LiveCategoryResult> getRecommendRooms(String siteId, {int page = 1}) async {
    final result = await _getJson('/api/v1/sites/$siteId/recommend?page=$page');
    return _categoryResultFromJson(result['data'] as Map<String, dynamic>);
  }

  @override
  Future<LiveCategoryResult> getCategoryRooms(String siteId, LiveSubCategory category, {int page = 1}) async {
    final result = await _getJson(
      '/api/v1/sites/$siteId/categories/rooms?categoryId=${category.id}&parentId=${category.parentId}&name=${Uri.encodeComponent(category.name)}&page=$page',
    );
    return _categoryResultFromJson(result['data'] as Map<String, dynamic>);
  }

  @override
  Future<LiveSearchRoomResult> searchRooms(String siteId, String keyword, {int page = 1}) async {
    final result = await _getJson('/api/v1/sites/$siteId/search/rooms?keyword=${Uri.encodeComponent(keyword)}&page=$page');
    return _searchRoomResultFromJson(result['data'] as Map<String, dynamic>);
  }

  @override
  Future<LiveSearchAnchorResult> searchAnchors(String siteId, String keyword, {int page = 1}) async {
    final result = await _getJson('/api/v1/sites/$siteId/search/anchors?keyword=${Uri.encodeComponent(keyword)}&page=$page');
    return _searchAnchorResultFromJson(result['data'] as Map<String, dynamic>);
  }

  @override
  Future<LiveRoomDetail> getRoomDetail(String siteId, String roomId) async {
    final result = await _getJson('/api/v1/sites/$siteId/rooms/$roomId');
    return roomDetailFromJson(result['data'] as Map<String, dynamic>);
  }

  @override
  Future<bool> getLiveStatus(String siteId, String roomId) async {
    final result = await _getJson('/api/v1/sites/$siteId/rooms/$roomId/live-status');
    return result['data']['liveStatus'] as bool;
  }

  @override
  Future<List<LivePlayQuality>> getPlayQualites(String siteId, LiveRoomDetail detail) async {
    final result = await _getJson('/api/v1/sites/$siteId/rooms/${detail.roomId}/qualities');
    final list = result['data'] as List<dynamic>;
    return list.map((e) => _playQualityFromJson(e as Map<String, dynamic>, siteId)).toList();
  }

  @override
  Future<LivePlayUrl> getPlayUrls(String siteId, LiveRoomDetail detail, LivePlayQuality quality) async {
    final result = await _postJson(
      '/api/v1/sites/$siteId/rooms/${detail.roomId}/play-urls',
      data: {'detail': _roomDetailToJson(detail), 'quality': _playQualityToJson(quality, siteId)},
    );
    return _playUrlFromJson(result['data'] as Map<String, dynamic>);
  }

  @override
  Future<List<LiveSuperChatMessage>> getSuperChatMessage(String siteId, String roomId) async {
    final result = await _getJson('/api/v1/sites/$siteId/rooms/$roomId/super-chat');
    final list = result['data'] as List<dynamic>;
    return list.map((e) => _superChatFromJson(e as Map<String, dynamic>)).toList();
  }

  @override
  LiveDanmaku getDanmaku(String siteId) {
    // 弹幕始终使用 simple_live_core 的 LiveDanmaku，不走服务端中转
    final site = Sites.allSites[siteId];
    final liveSite = site?.liveSite;
    if (liveSite != null) {
      return liveSite.getDanmaku();
    }
    // 未知平台返回 no-op，避免崩溃
    return LiveDanmaku();
  }

  // ============ HTTP 请求辅助方法 ============

  Future<dynamic> _getJson(String path) async {
    return await HttpClient.instance.getJson('$baseUrl$path');
  }

  Future<dynamic> _postJson(String path, {dynamic data}) async {
    return await HttpClient.instance.postJson('$baseUrl$path', data: data);
  }

  // ============ JSON 反序列化 ============

  LiveCategory _categoryFromJson(Map<String, dynamic> json) {
    return LiveCategory(
      id: json['id'] as String,
      name: json['name'] as String,
      children: (json['children'] as List<dynamic>).map((e) => subCategoryFromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  @visibleForTesting
  LiveSubCategory subCategoryFromJson(Map<String, dynamic> json) {
    return LiveSubCategory(
      id: json['id'] as String,
      name: json['name'] as String,
      parentId: json['parentId'] as String,
      pic: resolveUrl(json['pic'] as String? ?? ''),
    );
  }

  LiveCategoryResult _categoryResultFromJson(Map<String, dynamic> json) {
    return LiveCategoryResult(
      hasMore: json['hasMore'] as bool,
      items: (json['items'] as List<dynamic>).map((e) => roomItemFromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  @visibleForTesting
  LiveRoomItem roomItemFromJson(Map<String, dynamic> json) {
    return LiveRoomItem(
      roomId: json['roomId'] as String,
      title: json['title'] as String,
      cover: resolveUrl(json['cover'] as String),
      userName: json['userName'] as String,
      online: (json['online'] as num?)?.toInt() ?? 0,
    );
  }

  LiveSearchRoomResult _searchRoomResultFromJson(Map<String, dynamic> json) {
    return LiveSearchRoomResult(
      hasMore: json['hasMore'] as bool,
      items: (json['items'] as List<dynamic>).map((e) => roomItemFromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  LiveSearchAnchorResult _searchAnchorResultFromJson(Map<String, dynamic> json) {
    return LiveSearchAnchorResult(
      hasMore: json['hasMore'] as bool,
      items: (json['items'] as List<dynamic>).map((e) => anchorItemFromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  @visibleForTesting
  LiveAnchorItem anchorItemFromJson(Map<String, dynamic> json) {
    return LiveAnchorItem(
      roomId: json['roomId'] as String,
      userName: json['userName'] as String,
      avatar: resolveUrl(json['avatar'] as String),
      liveStatus: json['liveStatus'] as bool,
    );
  }

  @visibleForTesting
  LiveRoomDetail roomDetailFromJson(Map<String, dynamic> json) {
    return LiveRoomDetail(
      roomId: json['roomId'] as String,
      title: json['title'] as String,
      cover: resolveUrl(json['cover'] as String),
      userName: json['userName'] as String,
      userAvatar: resolveUrl(json['userAvatar'] as String),
      online: (json['online'] as num?)?.toInt() ?? 0,
      introduction: json['introduction'] as String?,
      notice: json['notice'] as String?,
      status: json['status'] as bool,
      data: _decodeDynamic(json['data']),
      danmakuData: _decodeDynamic(json['danmakuData']),
      url: json['url'] as String,
      isRecord: json['isRecord'] as bool? ?? false,
      showTime: json['showTime'] as String?,
    );
  }

  Map<String, dynamic> _roomDetailToJson(LiveRoomDetail detail) {
    return {
      'roomId': detail.roomId,
      'title': detail.title,
      'cover': detail.cover,
      'userName': detail.userName,
      'userAvatar': detail.userAvatar,
      'online': detail.online,
      'introduction': detail.introduction ?? '',
      'notice': detail.notice ?? '',
      'status': detail.status,
      'data': detail.data,
      'danmakuData': detail.danmakuData,
      'url': detail.url,
      'isRecord': detail.isRecord,
      'showTime': detail.showTime ?? '',
    };
  }

  LivePlayQuality _playQualityFromJson(Map<String, dynamic> json, String siteId) {
    final data = _decodeQualityData(json['data'], siteId);
    return LivePlayQuality(
      quality: json['quality'] as String,
      data: data,
      sort: (json['sort'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> _playQualityToJson(LivePlayQuality quality, String siteId) {
    return {
      'quality': quality.quality,
      'data': _encodeQualityData(quality.data, siteId),
      'sort': quality.sort,
    };
  }

  LivePlayUrl _playUrlFromJson(Map<String, dynamic> json) {
    final rawUrls = List<String>.from(json['urls'] as List);
    return LivePlayUrl(
      urls: rawUrls.map(_resolveUrl).toList(),
      headers: Map<String, String>.from(json['headers'] as Map),
    );
  }

  /// 解析服务端返回的播放地址。
  ///
  /// `local` 等服务端转封装平台返回的是相对路径
  /// （如 `/api/v1/stream/hls/{id}/play.m3u8`），需用当前 [baseUrl] 拼接成完整 URL，
  /// 避免后端 `0.0.0.0` 监听地址问题。参考 apple-tv 端 LiveRoomViewModel.loadLine。
  /// 绝对地址（`http://`/`https://`）原样保留。
  @visibleForTesting
  String resolveUrl(String url) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('/')) {
      final base = baseUrl.endsWith('/')
          ? baseUrl.substring(0, baseUrl.length - 1)
          : baseUrl;
      return '$base$url';
    }
    return url;
  }

  String _resolveUrl(String url) => resolveUrl(url);

  LiveSuperChatMessage _superChatFromJson(Map<String, dynamic> json) {
    return LiveSuperChatMessage(
      userName: json['userName'] as String,
      face: json['face'] as String,
      message: json['message'] as String,
      price: (json['price'] as num).toInt(),
      startTime: DateTime.parse(json['startTime'] as String),
      endTime: DateTime.parse(json['endTime'] as String),
      backgroundColor: json['backgroundColor'] as String,
      backgroundBottomColor: json['backgroundBottomColor'] as String,
    );
  }

  // ============ 动态类型编解码 ============
  // 与服务端 LiveSiteService 的编解码逻辑保持一致

  /// 将动态类型编码为可 JSON 序列化的值
  dynamic _encodeQualityData(dynamic value, String siteId) {
    if (value == null) return null;
    if (value is String || value is num || value is bool) return value;
    if (value is List || value is Map) return value;
    // 斗鱼 DouyuPlayData
    if (siteId == 'douyu' && value is DouyuPlayData) {
      return {'rate': value.rate, 'cdns': value.cdns};
    }
    return value.toString();
  }

  /// 根据平台还原 quality.data
  dynamic _decodeQualityData(dynamic value, String siteId) {
    if (value == null) return null;
    // 斗鱼：还原为 DouyuPlayData
    if (siteId == 'douyu' && value is Map) {
      final rate = (value['rate'] as num?)?.toInt() ?? 0;
      final cdns = (value['cdns'] as List?)?.cast<String>() ?? <String>[];
      return DouyuPlayData(rate, cdns);
    }
    // B站 data 为 int
    if (siteId == 'bilibili' && value is num) {
      return value.toInt();
    }
    // 其余平台直接透传
    return value;
  }

  /// 解码动态类型（List/Map 直接透传）
  dynamic _decodeDynamic(dynamic value) {
    if (value == null) return null;
    return value;
  }
}