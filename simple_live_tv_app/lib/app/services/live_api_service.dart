import 'package:simple_live_core/simple_live_core.dart';

/// LiveApi 抽象接口
///
/// 定义与 simple_live_core 的 LiveSite 方法签名一致的抽象类。
/// 根据配置返回 Remote 或 Local 实现。
abstract class LiveApiService {
  /// 获取分类列表
  Future<List<LiveCategory>> getCategores(String siteId);

  /// 获取推荐房间
  Future<LiveCategoryResult> getRecommendRooms(String siteId, {int page = 1});

  /// 获取分类下房间
  Future<LiveCategoryResult> getCategoryRooms(
    String siteId,
    LiveSubCategory category, {
    int page = 1,
  });

  /// 搜索直播间
  Future<LiveSearchRoomResult> searchRooms(
    String siteId,
    String keyword, {
    int page = 1,
  });

  /// 搜索主播
  Future<LiveSearchAnchorResult> searchAnchors(
    String siteId,
    String keyword, {
    int page = 1,
  });

  /// 获取房间详情
  Future<LiveRoomDetail> getRoomDetail(String siteId, String roomId);

  /// 获取直播状态
  Future<bool> getLiveStatus(String siteId, String roomId);

  /// 获取清晰度列表
  Future<List<LivePlayQuality>> getPlayQualites(
    String siteId,
    LiveRoomDetail detail,
  );

  /// 获取播放直链
  Future<LivePlayUrl> getPlayUrls(
    String siteId,
    LiveRoomDetail detail,
    LivePlayQuality quality,
  );

  /// 获取 SC 消息
  Future<List<LiveSuperChatMessage>> getSuperChatMessage(
    String siteId,
    String roomId,
  );

  /// 获取弹幕处理器
  ///
  /// 始终返回 simple_live_core 的 LiveDanmaku 实例，
  /// 弹幕连接不走服务端中转。
  LiveDanmaku getDanmaku(String siteId);
}
