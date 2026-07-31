/**
 * 同步数据管理器
 *
 * 对应 Dart 版 simple_live_server/lib/service/sync_data_manager.dart
 *
 * 保存关注列表、标签、观看记录、屏蔽词、设置。
 * 统一管理（不区分设备），所有客户端共享同一份数据。
 *
 * 存储模式：
 * - 配置了 syncDbPath 时，数据持久化到 SQLite，服务重启不丢失
 * - 未配置时，退化为纯内存模式（与 Dart 版一致）
 *
 * 读写策略：
 * - 启动时从 DB 全量加载到内存（读接口返回内存数组，保持 O(1) 性能）
 * - 写操作同时更新内存数组 + DB（实时持久化，崩溃不丢数据）
 */

import { SyncDb } from './sync-db.js';

/**
 * 同步数据管理器
 *
 * 支持关注列表、标签、观看记录、屏蔽词、设置、Cookie 的存储与同步。
 * 配置 syncDbPath 后数据持久化到 SQLite。
 */
export class SyncDataManager {
  /** SQLite 持久化层（为 null 时纯内存模式） */
  private syncDb: SyncDb | null = null;

  /** 关注列表数据 */
  private _followData: Array<Record<string, unknown>> = [];

  /** 标签数据 */
  private _tagData: Array<Record<string, unknown>> = [];

  /** 观看记录数据 */
  private _historyData: Array<Record<string, unknown>> = [];

  /** 屏蔽词数据 */
  private _blockedWordData: string[] = [];

  /** 设置数据 */
  private _settingsData: Record<string, unknown> = {};

  /** Cookie 存储：siteId -> cookie字符串 */
  private readonly _cookieData = new Map<string, string>();

  /**
   * 构造函数
   *
   * @param syncDbPath SQLite 数据库路径，为空则纯内存模式
   */
  constructor(syncDbPath?: string) {
    if (syncDbPath) {
      this.syncDb = new SyncDb(syncDbPath);
    }
  }

  /**
   * 初始化：从 SQLite 加载数据到内存
   *
   * 应在服务启动时调用
   */
  init(): void {
    if (!this.syncDb) return;

    this._followData = this.syncDb.getAllFollows();
    this._tagData = this.syncDb.getAllTags();
    this._historyData = this.syncDb.getAllHistories();
    this._blockedWordData = this.syncDb.getAllBlockedWords();
    this._settingsData = this.syncDb.getAllSettings();

    // 加载 Cookie
    const cookies = this.syncDb.getAllCookies();
    for (const [siteId, cookie] of cookies) {
      this._cookieData.set(siteId, cookie);
    }
  }

  /**
   * 关闭数据库连接
   *
   * 应在服务停止时调用
   */
  close(): void {
    this.syncDb?.close();
    this.syncDb = null;
  }

  // ============ 关注列表 ============

  /**
   * 获取关注列表（按 addTime 降序，最新关注在前）
   */
  getFollows(): Array<Record<string, unknown>> {
    return SyncDataManager._sortFollowsDesc(this._followData);
  }

  /**
   * 同步关注列表：上传本地数据，返回合并后的完整数据集
   *
   * 合并策略：按 id 去重，相同 id 保留 addTime 较新的
   */
  syncFollows(clientData: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    const serverData = this._followData;

    // 以 id 为 key 建立服务端数据索引
    const merged = new Map<string, Record<string, unknown>>();
    for (const item of serverData) {
      merged.set(item['id'] as string, item);
    }

    // 合并客户端数据
    for (const item of clientData) {
      const id = item['id'] as string;
      if (!merged.has(id)) {
        merged.set(id, item);
      } else {
        // 相同 id 保留 addTime 较新的
        const serverTime = SyncDataManager._parseDateTime(merged.get(id)!['addTime']);
        const clientTime = SyncDataManager._parseDateTime(item['addTime']);
        if (clientTime > serverTime) {
          merged.set(id, item);
        }
      }
    }

    const result = Array.from(merged.values());
    this._followData = result;

    // 持久化
    if (this.syncDb) {
      for (const item of result) {
        this.syncDb.upsertFollow(item['id'] as string, item);
      }
    }

    return SyncDataManager._sortFollowsDesc(result);
  }

  /**
   * 删除指定 id 的关注
   */
  deleteFollow(id: string): Array<Record<string, unknown>> {
    this._followData = this._followData.filter((item) => item['id'] !== id);
    this.syncDb?.deleteFollow(id);
    return SyncDataManager._sortFollowsDesc(this._followData);
  }

  // ============ 标签 ============

  /**
   * 获取标签列表
   */
  getTags(): Array<Record<string, unknown>> {
    return this._tagData;
  }

  /**
   * 同步标签：上传本地数据，返回合并后的完整数据集
   *
   * 合并策略：按 id 去重，相同 id 保留最新版本（取 userId 并集）
   */
  syncTags(clientData: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    const serverData = this._tagData;

    // 以 id 为 key 建立服务端数据索引
    const merged = new Map<string, Record<string, unknown>>();
    for (const item of serverData) {
      merged.set(item['id'] as string, { ...item });
    }

    // 合并客户端数据
    for (const item of clientData) {
      const id = item['id'] as string;
      if (!merged.has(id)) {
        merged.set(id, { ...item });
      } else {
        // 相同 id：取 userId 并集
        const serverUserIds = Array.isArray(merged.get(id)!['userId'])
          ? [...(merged.get(id)!['userId'] as string[])]
          : [];
        const clientUserIds = Array.isArray(item['userId'])
          ? [...(item['userId'] as string[])]
          : [];
        const union = [...new Set([...serverUserIds, ...clientUserIds])];
        // 保留客户端版本（较新），但 userId 取并集
        merged.set(id, { ...item });
        merged.get(id)!['userId'] = union;
      }
    }

    const result = Array.from(merged.values());
    this._tagData = result;

    // 持久化
    if (this.syncDb) {
      for (const item of result) {
        this.syncDb.upsertTag(item['id'] as string, item);
      }
    }

    return result;
  }

  // ============ 观看记录 ============

  /**
   * 获取观看记录（按 updateTime 降序，最近观看在前）
   */
  getHistories(): Array<Record<string, unknown>> {
    return SyncDataManager._sortHistoriesDesc(this._historyData);
  }

  /**
   * 同步观看记录：上传本地数据，返回合并后的完整数据集
   *
   * 合并策略：按 id 去重，相同 id 保留 updateTime 较新的
   */
  syncHistories(clientData: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    const serverData = this._historyData;

    // 以 id 为 key 建立服务端数据索引
    const merged = new Map<string, Record<string, unknown>>();
    for (const item of serverData) {
      merged.set(item['id'] as string, item);
    }

    // 合并客户端数据
    for (const item of clientData) {
      const id = item['id'] as string;
      if (!merged.has(id)) {
        merged.set(id, item);
      } else {
        // 相同 id 保留 updateTime 较新的
        const serverTime = SyncDataManager._parseDateTime(merged.get(id)!['updateTime']);
        const clientTime = SyncDataManager._parseDateTime(item['updateTime']);
        if (clientTime > serverTime) {
          merged.set(id, item);
        }
      }
    }

    const result = Array.from(merged.values());
    this._historyData = result;

    // 持久化
    if (this.syncDb) {
      for (const item of result) {
        this.syncDb.upsertHistory(item['id'] as string, item);
      }
    }

    return SyncDataManager._sortHistoriesDesc(result);
  }

  /**
   * 删除指定 id 的观看记录
   */
  deleteHistory(id: string): Array<Record<string, unknown>> {
    this._historyData = this._historyData.filter((item) => item['id'] !== id);
    this.syncDb?.deleteHistory(id);
    return SyncDataManager._sortHistoriesDesc(this._historyData);
  }

  // ============ 屏蔽词 ============

  /**
   * 获取屏蔽词列表
   */
  getBlockedWords(): string[] {
    return this._blockedWordData;
  }

  /**
   * 同步屏蔽词：上传本地数据，返回合并后的完整数据集
   *
   * 合并策略：取并集
   */
  syncBlockedWords(clientData: string[]): string[] {
    const serverData = this._blockedWordData;

    // 取并集
    const merged = [...new Set([...serverData, ...clientData])];

    this._blockedWordData = merged;

    // 持久化（整体替换）
    this.syncDb?.replaceBlockedWords(merged);

    return merged;
  }

  // ============ 设置 ============

  /**
   * 获取设置
   */
  getSettings(): Record<string, unknown> {
    return this._settingsData;
  }

  /**
   * 同步设置：上传本地数据，返回合并后的完整数据集
   *
   * 合并策略：按 key 去重，相同 key 保留较新值
   * 设置项为 Map<String, dynamic>，每个值可能包含 value 和 updateTime
   */
  syncSettings(clientData: Record<string, unknown>): Record<string, unknown> {
    const serverData = this._settingsData;

    const merged: Record<string, unknown> = { ...serverData };

    // 合并客户端数据
    for (const [key, value] of Object.entries(clientData)) {
      if (!(key in merged)) {
        merged[key] = value;
      } else {
        // 如果值是对象且包含 updateTime，按时间比较
        const serverVal = merged[key];
        const clientVal = value;

        if (
          typeof serverVal === 'object' && serverVal !== null && !Array.isArray(serverVal) &&
          typeof clientVal === 'object' && clientVal !== null && !Array.isArray(clientVal)
        ) {
          const serverTime = SyncDataManager._parseDateTime(
            (serverVal as Record<string, unknown>)['updateTime'],
          );
          const clientTime = SyncDataManager._parseDateTime(
            (clientVal as Record<string, unknown>)['updateTime'],
          );
          if (clientTime > serverTime) {
            merged[key] = value;
          }
        } else {
          // 简单值：客户端覆盖服务端（假设客户端较新）
          merged[key] = value;
        }
      }
    }

    this._settingsData = merged;

    // 持久化（只写入客户端提交的 key，避免全量覆盖）
    if (this.syncDb) {
      for (const [key, value] of Object.entries(clientData)) {
        this.syncDb.upsertSetting(key, value);
      }
    }

    return merged;
  }

  // ============ Cookie ============

  /**
   * 获取指定平台的 Cookie
   */
  getCookie(siteId: string): string | undefined {
    return this._cookieData.get(siteId);
  }

  /**
   * 设置指定平台的 Cookie
   */
  setCookie(siteId: string, cookie: string): void {
    this._cookieData.set(siteId, cookie);
    this.syncDb?.upsertCookie(siteId, cookie);
  }

  /**
   * 删除指定平台的 Cookie
   */
  deleteCookie(siteId: string): void {
    this._cookieData.delete(siteId);
    this.syncDb?.deleteCookie(siteId);
  }

  // ============ 辅助方法 ============

  /**
   * 关注列表按 addTime 降序排序（最新关注在前）
   *
   * 返回新数组，不修改原数组。addTime 缺失或解析失败的项置于尾部，保持稳定。
   */
  private static _sortFollowsDesc(
    data: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    return [...data].sort((a, b) => {
      const ta = SyncDataManager._parseDateTime(a['addTime']);
      const tb = SyncDataManager._parseDateTime(b['addTime']);
      return tb - ta;
    });
  }

  /**
   * 观看记录按 updateTime 降序排序（最近观看在前）
   *
   * 返回新数组，不修改原数组。updateTime 缺失或解析失败的项置于尾部，保持稳定。
   */
  private static _sortHistoriesDesc(
    data: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    return [...data].sort((a, b) => {
      const ta = SyncDataManager._parseDateTime(a['updateTime']);
      const tb = SyncDataManager._parseDateTime(b['updateTime']);
      return tb - ta;
    });
  }

  /**
   * 解析日期时间字符串
   *
   * 支持多种格式：ISO 8601、毫秒时间戳等
   */
  private static _parseDateTime(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }
}
