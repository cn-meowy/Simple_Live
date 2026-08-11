import 'package:simple_live_core/simple_live_core.dart';
import 'package:simple_live_tv_app/app/sites.dart';
import 'package:simple_live_tv_app/requests/http_client.dart';

import 'live_api_service.dart';

/// 远程 LiveApi 实现
///
/// 调用服务端 HTTP 接口，当服务端启用且可用时使用此实现。
/// JSON 反序列化复用服务端已有的 JSON 结构。
class RemoteLiveApi implements LiveApiService {
  final String baseUrl;

  RemoteLiveApi(this.baseUrl);

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
    return _roomDetailFromJson(result['data'] as Map<String, dynamic>);
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
    if (site == null) throw ArgumentError('不支持的平台: $siteId');
    return site.liveSite.getDanmaku();
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
      children: (json['children'] as List<dynamic>).map((e) => _subCategoryFromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  LiveSubCategory _subCategoryFromJson(Map<String, dynamic> json) {
    return LiveSubCategory(
      id: json['id'] as String,
      name: json['name'] as String,
      parentId: json['parentId'] as String,
      pic: json['pic'] as String? ?? '',
    );
  }

  LiveCategoryResult _categoryResultFromJson(Map<String, dynamic> json) {
    return LiveCategoryResult(
      hasMore: json['hasMore'] as bool,
      items: (json['items'] as List<dynamic>).map((e) => _roomItemFromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  LiveRoomItem _roomItemFromJson(Map<String, dynamic> json) {
    return LiveRoomItem(
      roomId: json['roomId'] as String,
      title: json['title'] as String,
      cover: json['cover'] as String,
      userName: json['userName'] as String,
      online: (json['online'] as num?)?.toInt() ?? 0,
    );
  }

  LiveSearchRoomResult _searchRoomResultFromJson(Map<String, dynamic> json) {
    return LiveSearchRoomResult(
      hasMore: json['hasMore'] as bool,
      items: (json['items'] as List<dynamic>).map((e) => _roomItemFromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  LiveSearchAnchorResult _searchAnchorResultFromJson(Map<String, dynamic> json) {
    return LiveSearchAnchorResult(
      hasMore: json['hasMore'] as bool,
      items: (json['items'] as List<dynamic>).map((e) => _anchorItemFromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  LiveAnchorItem _anchorItemFromJson(Map<String, dynamic> json) {
    return LiveAnchorItem(
      roomId: json['roomId'] as String,
      userName: json['userName'] as String,
      avatar: json['avatar'] as String,
      liveStatus: json['liveStatus'] as bool,
    );
  }

  LiveRoomDetail _roomDetailFromJson(Map<String, dynamic> json) {
    return LiveRoomDetail(
      roomId: json['roomId'] as String,
      title: json['title'] as String,
      cover: json['cover'] as String,
      userName: json['userName'] as String,
      userAvatar: json['userAvatar'] as String,
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
    return LivePlayUrl(
      urls: List<String>.from(json['urls'] as List),
      headers: Map<String, String>.from(json['headers'] as Map),
    );
  }

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
