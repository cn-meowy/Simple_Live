/**
 * 同步数据 SQLite 持久化层
 *
 * 基于 Node.js 22+ 内置的 node:sqlite 模块，管理关注列表、标签、观看记录、
 * 屏蔽词、设置、Cookie 的持久化。
 * 采用"主键 + JSON data"的灵活模式存储，适配客户端松散的数据结构。
 *
 * 表结构：
 * - follows:       关注列表（id 主键）
 * - tags:          标签（id 主键）
 * - histories:     观看记录（id 主键）
 * - blocked_words: 屏蔽词（word 主键）
 * - settings:      设置（key 主键，key-value）
 * - cookies:       Cookie（site_id 主键）
 */

import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 数据库行类型（通用）
 */
interface DbRow {
  id?: string;
  data?: string;
  word?: string;
  key?: string;
  value?: string;
  site_id?: string;
  cookie?: string;
}

export class SyncDb {
  private db: DatabaseSync;

  /**
   * 构造并初始化数据库
   *
   * @param dbPath SQLite 文件路径，为空则不创建实例（调用方应先判断）
   */
  constructor(dbPath: string) {
    // 确保目录存在
    const dir = path.dirname(dbPath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(dbPath);

    // 开启 WAL 模式，提升并发读写性能
    this.db.exec('PRAGMA journal_mode = WAL');

    this.initTables();
  }

  /**
   * 初始化所有表
   */
  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS follows (
        id       TEXT PRIMARY KEY,
        data     TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id       TEXT PRIMARY KEY,
        data     TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS histories (
        id       TEXT PRIMARY KEY,
        data     TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blocked_words (
        word     TEXT PRIMARY KEY
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key      TEXT PRIMARY KEY,
        value    TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cookies (
        site_id  TEXT PRIMARY KEY,
        cookie   TEXT NOT NULL
      )
    `);
  }

  // ============ 关注列表 ============

  /**
   * 写入或更新单条关注记录
   */
  upsertFollow(id: string, data: Record<string, unknown>): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO follows (id, data) VALUES (?, ?)',
    ).run(id, JSON.stringify(data));
  }

  /**
   * 删除指定关注
   */
  deleteFollow(id: string): void {
    this.db.prepare('DELETE FROM follows WHERE id = ?').run(id);
  }

  /**
   * 获取全部关注记录
   */
  getAllFollows(): Array<Record<string, unknown>> {
    const rows = this.db.prepare('SELECT data FROM follows').all() as DbRow[];
    return rows.map((r) => JSON.parse(r.data!) as Record<string, unknown>);
  }

  // ============ 标签 ============

  upsertTag(id: string, data: Record<string, unknown>): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO tags (id, data) VALUES (?, ?)',
    ).run(id, JSON.stringify(data));
  }

  getAllTags(): Array<Record<string, unknown>> {
    const rows = this.db.prepare('SELECT data FROM tags').all() as DbRow[];
    return rows.map((r) => JSON.parse(r.data!) as Record<string, unknown>);
  }

  // ============ 观看记录 ============

  upsertHistory(id: string, data: Record<string, unknown>): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO histories (id, data) VALUES (?, ?)',
    ).run(id, JSON.stringify(data));
  }

  deleteHistory(id: string): void {
    this.db.prepare('DELETE FROM histories WHERE id = ?').run(id);
  }

  getAllHistories(): Array<Record<string, unknown>> {
    const rows = this.db.prepare('SELECT data FROM histories').all() as DbRow[];
    return rows.map((r) => JSON.parse(r.data!) as Record<string, unknown>);
  }

  // ============ 屏蔽词 ============

  /**
   * 批量替换屏蔽词（先清空再插入）
   */
  replaceBlockedWords(words: string[]): void {
    this.db.exec('DELETE FROM blocked_words');
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO blocked_words (word) VALUES (?)',
    );
    for (const w of words) {
      stmt.run(w);
    }
  }

  getAllBlockedWords(): string[] {
    const rows = this.db.prepare('SELECT word FROM blocked_words').all() as DbRow[];
    return rows.map((r) => r.word!);
  }

  // ============ 设置 ============

  upsertSetting(key: string, value: unknown): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    ).run(key, JSON.stringify(value));
  }

  getAllSettings(): Record<string, unknown> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as DbRow[];
    const result: Record<string, unknown> = {};
    for (const r of rows) {
      result[r.key!] = JSON.parse(r.value!);
    }
    return result;
  }

  // ============ Cookie ============

  upsertCookie(siteId: string, cookie: string): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO cookies (site_id, cookie) VALUES (?, ?)',
    ).run(siteId, cookie);
  }

  deleteCookie(siteId: string): void {
    this.db.prepare('DELETE FROM cookies WHERE site_id = ?').run(siteId);
  }

  getCookie(siteId: string): string | undefined {
    const row = this.db.prepare(
      'SELECT cookie FROM cookies WHERE site_id = ?',
    ).get(siteId) as DbRow | undefined;
    return row?.cookie;
  }

  /**
   * 获取全部 Cookie（启动时加载到内存 Map）
   */
  getAllCookies(): Map<string, string> {
    const rows = this.db.prepare('SELECT site_id, cookie FROM cookies').all() as DbRow[];
    const result = new Map<string, string>();
    for (const r of rows) {
      result.set(r.site_id!, r.cookie!);
    }
    return result;
  }

  // ============ 生命周期 ============

  /**
   * 关闭数据库连接
   */
  close(): void {
    try {
      this.db.close();
    } catch {
      // ignore
    }
  }
}
