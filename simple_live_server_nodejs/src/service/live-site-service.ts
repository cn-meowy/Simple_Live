/**
 * 直播服务层
 *
 * 对应 Dart 版 simple_live_server/lib/service/live_site_service.dart
 *
 * 封装所有平台的 LiveSite 调用，统一管理平台实例映射。
 * 复用 simple_live_core 的全部能力，零改动。
 */

import {
  LiveSite,
  LiveDanmaku,
  LiveCategory,
  LiveSubCategory,
  LiveCategoryResult,
  LiveSearchRoomResult,
  LiveSearchAnchorResult,
  LiveRoomDetail,
  LivePlayQuality,
  DouyuPlayData,
  LivePlayUrl,
  LiveRoomItem,
  LiveAnchorItem,
  LiveMessage,
  LiveSuperChatMessage,
  BiliBiliSite,
  DouyuSite,
  HuyaSite,
  DouyinSite,
  LocalLiveSite,
} from '../core/index.js';
import { ServerConfig } from '../config/server-config.js';
import { LocalVideoScanner } from './local-video-scanner.js';

/**
 * 直播服务层
 *
 * 管理各平台 LiveSite 实例，统一对外提供 API 调用。
 */
export class LiveSiteService {
  /** 平台 ID -> LiveSite 实例 */
  private readonly _sites = new Map<string, LiveSite>();

  /** 本地视频扫描器（local 平台数据源） */
  private _localScanner: LocalVideoScanner | null = null;

  readonly config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this._initSites();
    this._initLocalSite();
  }

  private _initSites(): void {
    const bilibili = new BiliBiliSite();
    bilibili.cookie = this.config.bilibiliCookie;
    this._sites.set('bilibili', bilibili);

    this._sites.set('douyu', new DouyuSite());
    this._sites.set('huya', new HuyaSite());

    const douyin = new DouyinSite();
    douyin.cookie = this.config.douyinCookie;
    this._sites.set('douyin', douyin);
  }

  /**
   * 初始化本地虚拟平台
   *
   * 传入 demoMode、coverDir、coverBaseUrl：
   * - demoMode 为 true 时，扫描目录会截取视频第一帧作为封面
   * - coverDir 为封面图片存储目录
   * - coverBaseUrl 用于拼接封面可访问的 HTTP URL
   */
  private _initLocalSite(): void {
    // 封面使用相对路径前缀，客户端拼接自身配置的 serverURL 即可访问，
    // 避免后端 host 为 0.0.0.0 时客户端无法访问的问题
    const coverBaseUrl = '/api/v1/stream/covers';
    const scanner = new LocalVideoScanner(
      this.config.localVideoDir,
      this.config.localDataFile,
      this.config.demoMode,
      this.config.coverDir,
      coverBaseUrl,
    );
    this._localScanner = scanner;
    this._sites.set('local', new LocalLiveSite(scanner));
  }

  /**
   * 加载本地视频数据
   *
   * 在服务启动时调用，优先读取数据文件，不存在则扫描目录。
   */
  async loadLocalData(): Promise<void> {
    if (this._localScanner) {
      await this._localScanner.load();
    }
  }

  /**
   * 获取所有平台信息
   *
   * - 演示模式开启时只返回 local 平台（用于 Apple Store 审核）
   * - 非演示模式返回所有真实平台，排除 local（local 仅在演示模式下显示）
   */
  getSites(): Array<{ id: string; name: string }> {
    if (this.config.demoMode) {
      const local = this._sites.get('local');
      return local ? [{ id: local.id, name: local.name }] : [];
    }

    const result: Array<{ id: string; name: string }> = [];
    for (const site of this._sites.values()) {
      // 非演示模式排除 local 平台
      if (site.id === 'local') continue;
      result.push({ id: site.id, name: site.name });
    }
    return result;
  }

  /**
   * 根据 siteId 获取 LiveSite，不存在抛异常
   */
  getSite(siteId: string): LiveSite {
    const site = this._sites.get(siteId);
    if (!site) {
      throw new Error(`不支持的平台: ${siteId}`);
    }
    return site;
  }

  /**
   * 获取分类列表
   */
  async getCategories(siteId: string): Promise<LiveCategory[]> {
    return this.getSite(siteId).getCategores();
  }

  /**
   * 获取推荐房间
   */
  async getRecommendRooms(siteId: string, page = 1): Promise<LiveCategoryResult> {
    return this.getSite(siteId).getRecommendRooms(page);
  }

  /**
   * 获取分类下房间
   */
  async getCategoryRooms(
    siteId: string,
    category: LiveSubCategory,
    page = 1,
  ): Promise<LiveCategoryResult> {
    return this.getSite(siteId).getCategoryRooms(category, page);
  }

  /**
   * 搜索直播间
   */
  async searchRooms(
    siteId: string,
    keyword: string,
    page = 1,
  ): Promise<LiveSearchRoomResult> {
    return this.getSite(siteId).searchRooms(keyword, page);
  }

  /**
   * 搜索主播
   */
  async searchAnchors(
    siteId: string,
    keyword: string,
    page = 1,
  ): Promise<LiveSearchAnchorResult> {
    return this.getSite(siteId).searchAnchors(keyword, page);
  }

  /**
   * 获取房间详情
   */
  async getRoomDetail(siteId: string, roomId: string): Promise<LiveRoomDetail> {
    return this.getSite(siteId).getRoomDetail(roomId);
  }

  /**
   * 获取直播状态
   */
  async getLiveStatus(siteId: string, roomId: string): Promise<boolean> {
    return this.getSite(siteId).getLiveStatus(roomId);
  }

  /**
   * 获取清晰度列表
   */
  async getPlayQualites(
    siteId: string,
    detail: LiveRoomDetail,
  ): Promise<LivePlayQuality[]> {
    return this.getSite(siteId).getPlayQualites(detail);
  }

  /**
   * 获取播放直链
   */
  async getPlayUrls(
    siteId: string,
    detail: LiveRoomDetail,
    quality: LivePlayQuality,
  ): Promise<LivePlayUrl> {
    return this.getSite(siteId).getPlayUrls(detail, quality);
  }

  /**
   * 获取 SC 消息
   */
  async getSuperChatMessage(
    siteId: string,
    roomId: string,
  ): Promise<LiveSuperChatMessage[]> {
    return this.getSite(siteId).getSuperChatMessage(roomId);
  }

  /**
   * 创建弹幕处理器
   */
  getDanmaku(siteId: string): LiveDanmaku {
    return this.getSite(siteId).getDanmaku();
  }

  // ============ 以下为 DTO 转换辅助方法 ============

  /**
   * LiveRoomItem -> JSON
   */
  static roomItemToJson(item: LiveRoomItem): Record<string, unknown> {
    return {
      roomId: item.roomId,
      title: item.title,
      cover: item.cover,
      userName: item.userName,
      online: item.online,
    };
  }

  /**
   * LiveAnchorItem -> JSON
   */
  static anchorItemToJson(item: LiveAnchorItem): Record<string, unknown> {
    return {
      roomId: item.roomId,
      userName: item.userName,
      avatar: item.avatar,
      liveStatus: item.liveStatus,
    };
  }

  /**
   * LiveCategory -> JSON
   */
  static categoryToJson(cat: LiveCategory): Record<string, unknown> {
    return {
      id: cat.id,
      name: cat.name,
      children: cat.children.map(LiveSiteService.subCategoryToJson),
    };
  }

  /**
   * LiveSubCategory -> JSON
   */
  static subCategoryToJson(sub: LiveSubCategory): Record<string, unknown> {
    return {
      id: sub.id,
      name: sub.name,
      parentId: sub.parentId,
      pic: sub.pic,
    };
  }

  /**
   * LiveCategoryResult -> JSON
   */
  static categoryResultToJson(result: LiveCategoryResult): Record<string, unknown> {
    return {
      hasMore: result.hasMore,
      items: result.items.map(LiveSiteService.roomItemToJson),
    };
  }

  /**
   * LiveSearchRoomResult -> JSON
   */
  static searchRoomResultToJson(result: LiveSearchRoomResult): Record<string, unknown> {
    return {
      hasMore: result.hasMore,
      items: result.items.map(LiveSiteService.roomItemToJson),
    };
  }

  /**
   * LiveSearchAnchorResult -> JSON
   */
  static searchAnchorResultToJson(result: LiveSearchAnchorResult): Record<string, unknown> {
    return {
      hasMore: result.hasMore,
      items: result.items.map(LiveSiteService.anchorItemToJson),
    };
  }

  /**
   * LiveRoomDetail -> JSON
   *
   * data 字段是动态类型，各平台不同，统一转为可序列化形式：
   * - 保留原始 data 的 JSON 表示（用于回传 getPlayUrls）
   * - 同时提供 dataJson 供客户端使用
   */
  static roomDetailToJson(detail: LiveRoomDetail): Record<string, unknown> {
    return {
      roomId: detail.roomId,
      title: detail.title,
      cover: detail.cover,
      userName: detail.userName,
      userAvatar: detail.userAvatar,
      online: detail.online,
      introduction: detail.introduction ?? '',
      notice: detail.notice ?? '',
      status: detail.status,
      data: LiveSiteService._encodeDynamic(detail.data),
      danmakuData: LiveSiteService._encodeDynamic(detail.danmakuData),
      url: detail.url,
      isRecord: detail.isRecord,
      showTime: detail.showTime ?? '',
    };
  }

  /**
   * 从 JSON 重建 LiveRoomDetail（用于 getPlayUrls 请求体）
   */
  static roomDetailFromJson(json: Record<string, unknown>): LiveRoomDetail {
    return new LiveRoomDetail(
      json['roomId'] as string,
      json['title'] as string,
      json['cover'] as string,
      json['userName'] as string,
      json['userAvatar'] as string,
      typeof json['online'] === 'number' ? json['online'] : Number(json['online']) || 0,
      json['status'] as boolean,
      json['url'] as string,
      LiveSiteService._decodeDynamic(json['data']),
      LiveSiteService._decodeDynamic(json['danmakuData']),
      (json['introduction'] as string) || undefined,
      (json['notice'] as string) || undefined,
      (json['isRecord'] as boolean) ?? false,
      (json['showTime'] as string) || undefined,
    );
  }

  /**
   * LivePlayQuality -> JSON
   */
  static playQualityToJson(q: LivePlayQuality): Record<string, unknown> {
    return {
      quality: q.quality,
      data: LiveSiteService._encodeDynamic(q.data),
      sort: q.sort,
    };
  }

  /**
   * 从 JSON 重建 LivePlayQuality
   *
   * 斗鱼的 quality.data 是 DouyuPlayData 对象（含 rate + cdns），
   * 需要特殊还原；其余平台 data 为 int/Map/List，直接透传。
   */
  static playQualityFromJson(
    json: Record<string, unknown>,
    siteId: string,
  ): LivePlayQuality {
    const data = LiveSiteService._decodeQualityData(json['data'], siteId);
    return new LivePlayQuality(
      json['quality'] as string,
      data,
      typeof json['sort'] === 'number' ? json['sort'] : Number(json['sort']) || 0,
    );
  }

  /**
   * 根据平台还原 quality.data
   *
   * - 斗鱼：还原为 DouyuPlayData 对象
   * - 其余平台：直接透传 JSON
   */
  private static _decodeQualityData(value: unknown, siteId: string): unknown {
    if (value === null || value === undefined) return undefined;

    // 斗鱼：还原为 DouyuPlayData
    if (siteId === 'douyu' && typeof value === 'object' && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      const rate = typeof v['rate'] === 'number' ? v['rate'] : Number(v['rate']) || 0;
      const cdns = Array.isArray(v['cdns']) ? (v['cdns'] as string[]) : [];
      return new DouyuPlayData(rate, cdns);
    }

    // B站 data 为 int
    if (siteId === 'bilibili' && typeof value === 'number') {
      return value;
    }

    // 虎牙/抖音 直接透传 Map/List
    return value;
  }

  /**
   * LivePlayUrl -> JSON
   */
  static playUrlToJson(url: LivePlayUrl): Record<string, unknown> {
    return {
      urls: url.urls,
      headers: url.headers,
    };
  }

  /**
   * LiveMessage -> JSON
   */
  static messageToJson(msg: LiveMessage): Record<string, unknown> {
    return {
      type: msg.type,
      userName: msg.userName,
      message: msg.message,
      data: msg.data !== undefined ? String(msg.data) : undefined,
      color: msg.color.toString(),
    };
  }

  /**
   * LiveSuperChatMessage -> JSON
   */
  static superChatToJson(sc: LiveSuperChatMessage): Record<string, unknown> {
    return {
      userName: sc.userName,
      face: sc.face,
      message: sc.message,
      price: sc.price,
      startTime: sc.startTime.toISOString(),
      endTime: sc.endTime.toISOString(),
      backgroundColor: sc.backgroundColor,
      backgroundBottomColor: sc.backgroundBottomColor,
    };
  }

  /**
   * 将动态类型编码为可 JSON 序列化的值
   */
  private static _encodeDynamic(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value) || typeof value === 'object') {
      return value;
    }
    // 自定义类型：尝试 toString() 后 JSON.parse
    try {
      return JSON.parse(String(value));
    } catch {
      return String(value);
    }
  }

  /**
   * 将 JSON 值解码回原始类型（保持透传）
   */
  private static _decodeDynamic(value: unknown): unknown {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    return value; // List/Map 直接返回
  }
}
