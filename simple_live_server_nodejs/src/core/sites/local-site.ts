/**
 * LocalLiveSite - 本地虚拟直播平台
 *
 * 实现 LiveSite 抽象类，作为 siteId = "local" 的适配器。
 * 数据来源为 LocalVideoScanner（本地视频文件扫描）。
 * 播放地址返回本地文件路径，由 stream-routes 识别并转为 HLS。
 */

import { LiveSite } from '../interface/live-site.js';
import { LiveDanmaku } from '../interface/live-danmaku.js';
import { LiveCategory, LiveSubCategory } from '../model/live-category.js';
import { LiveCategoryResult } from '../model/live-category-result.js';
import { LiveSearchRoomResult, LiveSearchAnchorResult } from '../model/live-search-result.js';
import { LiveRoomDetail } from '../model/live-room-detail.js';
import { LivePlayQuality } from '../model/live-play-quality.js';
import { LivePlayUrl } from '../model/live-play-url.js';
import { LiveRoomItem } from '../model/live-room-item.js';
import { LiveAnchorItem } from '../model/live-anchor-item.js';
import { LiveSuperChatMessage } from '../model/live-message.js';
import { LocalRoomData } from '../model/local-room-data.js';
import { LocalVideoScanner } from '../../service/local-video-scanner.js';

/** 每页大小（搜索结果） */
const SEARCH_PAGE_SIZE = 20;

export class LocalLiveSite extends LiveSite {
  readonly id = 'local';
  readonly name = '本地';

  private readonly scanner: LocalVideoScanner;

  constructor(scanner: LocalVideoScanner) {
    super();
    this.scanner = scanner;
  }

  /** 创建弹幕处理器（空实现，本地无弹幕） */
  getDanmaku(): LiveDanmaku {
    return new LocalDanmaku();
  }

  /** 读取分类列表：返回一个"全部"分类 */
  async getCategores(): Promise<LiveCategory[]> {
    return [
      new LiveCategory('all', '全部', [
        new LiveSubCategory('all', '全部', 'all'),
      ]),
    ];
  }

  /** 推荐房间：返回全部房间（分页） */
  async getRecommendRooms(page: number = 1): Promise<LiveCategoryResult> {
    const result = this.scanner.getRoomsByPage(page);
    return new LiveCategoryResult(
      result.hasMore,
      result.items.map(LocalLiveSite._roomDataToItem),
    );
  }

  /** 分类下房间：等同于推荐 */
  async getCategoryRooms(
    category: LiveSubCategory,
    page: number = 1,
  ): Promise<LiveCategoryResult> {
    return this.getRecommendRooms(page);
  }

  /** 搜索直播间：标题模糊匹配 */
  async searchRooms(
    keyword: string,
    page: number = 1,
  ): Promise<LiveSearchRoomResult> {
    const matched = this.scanner.searchRooms(keyword);
    const start = (page - 1) * SEARCH_PAGE_SIZE;
    const items = matched.slice(start, start + SEARCH_PAGE_SIZE);
    const hasMore = start + SEARCH_PAGE_SIZE < matched.length;
    return new LiveSearchRoomResult(hasMore, items.map(LocalLiveSite._roomDataToItem));
  }

  /** 搜索主播：本地无主播概念，按标题匹配返回 */
  async searchAnchors(
    keyword: string,
    page: number = 1,
  ): Promise<LiveSearchAnchorResult> {
    const matched = this.scanner.searchRooms(keyword);
    const start = (page - 1) * SEARCH_PAGE_SIZE;
    const items = matched.slice(start, start + SEARCH_PAGE_SIZE);
    const hasMore = start + SEARCH_PAGE_SIZE < matched.length;
    return new LiveSearchAnchorResult(
      hasMore,
      items.map((r) => new LiveAnchorItem(r.roomId, r.userName, '', true)),
    );
  }

  /** 房间详情：从 scanner 查找，构建 LiveRoomDetail */
  async getRoomDetail(roomId: string): Promise<LiveRoomDetail> {
    const room = this.scanner.findRoom(roomId);
    if (!room) {
      throw new Error(`本地房间不存在: ${roomId}`);
    }
    return new LiveRoomDetail(
      room.roomId,
      room.title,
      room.cover,
      room.userName,
      '',
      room.online,
      true,               // status：文件存在即"直播中"
      '',                 // url
      { filePath: room.filePath } as unknown,  // data：内部传递文件路径
      undefined,          // danmakuData
      '本地视频文件直播',    // introduction
      '',                 // notice
      false,              // isRecord
    );
  }

  /** 直播状态：始终返回 true */
  async getLiveStatus(roomId: string): Promise<boolean> {
    return this.scanner.findRoom(roomId) !== undefined;
  }

  /** 清晰度：返回单个"原画" */
  async getPlayQualites(_detail: LiveRoomDetail): Promise<LivePlayQuality[]> {
    return [
      new LivePlayQuality('原画', null, 0),
    ];
  }

  /** 播放地址：返回本地文件路径（stream-routes 会识别并转流） */
  async getPlayUrls(detail: LiveRoomDetail, _quality: LivePlayQuality): Promise<LivePlayUrl> {
    const data = detail.data as { filePath?: string } | undefined;
    const filePath = data?.filePath;
    if (!filePath) {
      throw new Error('本地房间缺少文件路径信息');
    }
    return new LivePlayUrl([filePath], {});
  }

  /** SC：返回空数组 */
  async getSuperChatMessage(_roomId: string): Promise<LiveSuperChatMessage[]> {
    return [];
  }

  // ====== 私有辅助方法 ======

  /** LocalRoomData -> LiveRoomItem */
  private static _roomDataToItem(room: LocalRoomData): LiveRoomItem {
    return new LiveRoomItem(
      room.roomId,
      room.title,
      room.cover,
      room.userName,
      room.online,
    );
  }
}

/**
 * LocalDanmaku - 本地空弹幕处理器
 *
 * 实现抽象方法 start/stop，但不做任何操作。
 * 客户端不会收到任何弹幕消息。
 */
class LocalDanmaku extends LiveDanmaku {
  async start(_args: unknown): Promise<void> {
    // 本地平台无弹幕，直接触发 onReady
    if (this.onReady) {
      this.onReady();
    }
  }

  async stop(): Promise<void> {
    // 无操作
  }
}
