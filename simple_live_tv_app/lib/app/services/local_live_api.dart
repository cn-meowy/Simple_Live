import 'package:simple_live_core/simple_live_core.dart';
import 'package:simple_live_tv_app/app/sites.dart';

import 'live_api_service.dart';

/// 本地 LiveApi 实现
///
/// 直接包装 simple_live_core 的 LiveSite 调用，
/// 当服务端未启用或不可用时使用此实现。
class LocalLiveApi implements LiveApiService {
  @override
  Future<List<LiveCategory>> getCategores(String siteId) {
    return _getSite(siteId).getCategores();
  }

  @override
  Future<LiveCategoryResult> getRecommendRooms(String siteId, {int page = 1}) {
    return _getSite(siteId).getRecommendRooms(page: page);
  }

  @override
  Future<LiveCategoryResult> getCategoryRooms(
    String siteId,
    LiveSubCategory category, {
    int page = 1,
  }) {
    return _getSite(siteId).getCategoryRooms(category, page: page);
  }

  @override
  Future<LiveSearchRoomResult> searchRooms(
    String siteId,
    String keyword, {
    int page = 1,
  }) {
    return _getSite(siteId).searchRooms(keyword, page: page);
  }

  @override
  Future<LiveSearchAnchorResult> searchAnchors(
    String siteId,
    String keyword, {
    int page = 1,
  }) {
    return _getSite(siteId).searchAnchors(keyword, page: page);
  }

  @override
  Future<LiveRoomDetail> getRoomDetail(String siteId, String roomId) {
    return _getSite(siteId).getRoomDetail(roomId: roomId);
  }

  @override
  Future<bool> getLiveStatus(String siteId, String roomId) {
    return _getSite(siteId).getLiveStatus(roomId: roomId);
  }

  @override
  Future<List<LivePlayQuality>> getPlayQualites(
    String siteId,
    LiveRoomDetail detail,
  ) {
    return _getSite(siteId).getPlayQualites(detail: detail);
  }

  @override
  Future<LivePlayUrl> getPlayUrls(
    String siteId,
    LiveRoomDetail detail,
    LivePlayQuality quality,
  ) {
    return _getSite(siteId).getPlayUrls(detail: detail, quality: quality);
  }

  @override
  Future<List<LiveSuperChatMessage>> getSuperChatMessage(
    String siteId,
    String roomId,
  ) {
    return _getSite(siteId).getSuperChatMessage(roomId: roomId);
  }

  @override
  LiveDanmaku getDanmaku(String siteId) {
    return _getSite(siteId).getDanmaku();
  }

  /// 根据 siteId 获取 LiveSite 实例
  LiveSite _getSite(String siteId) {
    final site = Sites.allSites[siteId];
    if (site == null) {
      throw ArgumentError('不支持的平台: $siteId');
    }
    return site.liveSite;
  }
}
