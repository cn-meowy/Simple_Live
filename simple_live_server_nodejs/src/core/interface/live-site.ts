/**
 * LiveSite 抽象基类
 *
 * 对应 Dart 版 simple_live_core/lib/src/interface/live_site.dart
 * 各直播平台适配器继承此类，实现具体的 API 调用逻辑。
 */

import { LiveDanmaku } from './live-danmaku.js';
import { LiveCategory, LiveSubCategory } from '../model/live-category.js';
import { LiveCategoryResult } from '../model/live-category-result.js';
import { LiveSearchRoomResult, LiveSearchAnchorResult } from '../model/live-search-result.js';
import { LiveRoomDetail } from '../model/live-room-detail.js';
import { LivePlayQuality } from '../model/live-play-quality.js';
import { LivePlayUrl } from '../model/live-play-url.js';
import { LiveSuperChatMessage } from '../model/live-message.js';

export abstract class LiveSite {
  /** 站点唯一ID */
  abstract id: string;

  /** 站点名称 */
  abstract name: string;

  /** 创建弹幕处理器 */
  abstract getDanmaku(): LiveDanmaku;

  /** 读取网站的分类 */
  abstract getCategores(): Promise<LiveCategory[]>;

  /** 搜索直播间 */
  abstract searchRooms(keyword: string, page?: number): Promise<LiveSearchRoomResult>;

  /** 搜索主播 */
  abstract searchAnchors(keyword: string, page?: number): Promise<LiveSearchAnchorResult>;

  /** 读取类目下房间 */
  abstract getCategoryRooms(category: LiveSubCategory, page?: number): Promise<LiveCategoryResult>;

  /** 读取推荐的房间 */
  abstract getRecommendRooms(page?: number): Promise<LiveCategoryResult>;

  /** 读取房间详情 */
  abstract getRoomDetail(roomId: string): Promise<LiveRoomDetail>;

  /** 读取房间清晰度 */
  abstract getPlayQualites(detail: LiveRoomDetail): Promise<LivePlayQuality[]>;

  /** 读取播放链接 */
  abstract getPlayUrls(detail: LiveRoomDetail, quality: LivePlayQuality): Promise<LivePlayUrl>;

  /** 查询直播状态 */
  abstract getLiveStatus(roomId: string): Promise<boolean>;

  /** 读取指定房间的 SC */
  abstract getSuperChatMessage(roomId: string): Promise<LiveSuperChatMessage[]>;
}
