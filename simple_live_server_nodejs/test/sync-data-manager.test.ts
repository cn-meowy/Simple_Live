/**
 * SyncDataManager 单元测试
 *
 * 验证关注列表、观看记录的增删改查及 SQLite 持久化（重启恢复）
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SyncDataManager } from '../src/service/sync-data-manager.js';

const TEST_DB_DIR = path.join(import.meta.dirname, 'test_db');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test_sync.db');

describe('SyncDataManager', () => {
  before(async () => {
    await fs.mkdir(TEST_DB_DIR, { recursive: true });
  });

  after(async () => {
    await fs.rm(TEST_DB_DIR, { recursive: true, force: true });
  });

  describe('纯内存模式（未配置 dbPath）', () => {
    let manager: SyncDataManager;

    beforeEach(() => {
      manager = new SyncDataManager();
    });

    it('应正确同步关注列表', () => {
      const clientData = [
        { id: 'f1', roomId: '111', userName: '主播A', addTime: '2026-01-01T00:00:00Z' },
        { id: 'f2', roomId: '222', userName: '主播B', addTime: '2026-01-02T00:00:00Z' },
      ];

      const result = manager.syncFollows(clientData);
      assert.equal(result.length, 2);
      assert.equal(manager.getFollows().length, 2);
    });

    it('相同 id 的关注应保留 addTime 较新的', () => {
      manager.syncFollows([
        { id: 'f1', roomId: '111', addTime: '2026-01-01T00:00:00Z' },
      ]);

      // 同一 id，addTime 更新
      const result = manager.syncFollows([
        { id: 'f1', roomId: '111', addTime: '2026-02-01T00:00:00Z' },
      ]);

      assert.equal(result.length, 1);
      assert.equal(result[0]['addTime'], '2026-02-01T00:00:00Z');
    });

    it('应删除指定关注', () => {
      manager.syncFollows([
        { id: 'f1', addTime: '2026-01-01T00:00:00Z' },
        { id: 'f2', addTime: '2026-01-02T00:00:00Z' },
      ]);

      manager.deleteFollow('f1');
      assert.equal(manager.getFollows().length, 1);
      assert.equal(manager.getFollows()[0]['id'], 'f2');
    });

    it('关注列表应按 addTime 降序返回', () => {
      // 故意乱序插入
      manager.syncFollows([
        { id: 'f1', addTime: '2026-01-02T00:00:00Z' },
        { id: 'f2', addTime: '2026-03-01T00:00:00Z' },
        { id: 'f3', addTime: '2026-02-01T00:00:00Z' },
      ]);

      const result = manager.getFollows();
      assert.deepEqual(
        result.map((x) => x['id']),
        ['f2', 'f3', 'f1'],
      );
    });

    it('syncFollows 返回值也应按 addTime 降序', () => {
      const result = manager.syncFollows([
        { id: 'f1', addTime: '2026-01-01T00:00:00Z' },
        { id: 'f2', addTime: '2026-01-03T00:00:00Z' },
        { id: 'f3', addTime: '2026-01-02T00:00:00Z' },
      ]);

      assert.deepEqual(
        result.map((x) => x['id']),
        ['f2', 'f3', 'f1'],
      );
    });

    it('关注列表 addTime 缺失时不应抛错且保持稳定', () => {
      manager.syncFollows([
        { id: 'f1', addTime: '2026-01-01T00:00:00Z' },
        { id: 'f2' },
      ]);

      const result = manager.getFollows();
      assert.equal(result.length, 2);
      // 有效时间的项在前，缺失项在后
      assert.equal(result[0]['id'], 'f1');
      assert.equal(result[1]['id'], 'f2');
    });

    it('删除关注后仍保持降序', () => {
      manager.syncFollows([
        { id: 'f1', addTime: '2026-01-01T00:00:00Z' },
        { id: 'f2', addTime: '2026-01-03T00:00:00Z' },
        { id: 'f3', addTime: '2026-01-02T00:00:00Z' },
      ]);

      manager.deleteFollow('f2');
      const result = manager.getFollows();
      assert.deepEqual(
        result.map((x) => x['id']),
        ['f3', 'f1'],
      );
    });

    it('应正确同步观看记录', () => {
      const clientData = [
        { id: 'h1', roomId: '111', updateTime: '2026-01-01T00:00:00Z' },
        { id: 'h2', roomId: '222', updateTime: '2026-01-02T00:00:00Z' },
      ];

      const result = manager.syncHistories(clientData);
      assert.equal(result.length, 2);
    });

    it('相同 id 的观看记录应保留 updateTime 较新的', () => {
      manager.syncHistories([
        { id: 'h1', roomId: '111', updateTime: '2026-01-01T00:00:00Z' },
      ]);

      const result = manager.syncHistories([
        { id: 'h1', roomId: '111', updateTime: '2026-02-01T00:00:00Z' },
      ]);

      assert.equal(result.length, 1);
      assert.equal(result[0]['updateTime'], '2026-02-01T00:00:00Z');
    });

    it('应删除指定观看记录', () => {
      manager.syncHistories([
        { id: 'h1', updateTime: '2026-01-01T00:00:00Z' },
        { id: 'h2', updateTime: '2026-01-02T00:00:00Z' },
      ]);

      manager.deleteHistory('h1');
      assert.equal(manager.getHistories().length, 1);
      assert.equal(manager.getHistories()[0]['id'], 'h2');
    });

    it('观看记录应按 updateTime 降序返回', () => {
      // 故意乱序插入
      manager.syncHistories([
        { id: 'h1', updateTime: '2026-01-02T00:00:00Z' },
        { id: 'h2', updateTime: '2026-03-01T00:00:00Z' },
        { id: 'h3', updateTime: '2026-02-01T00:00:00Z' },
      ]);

      const result = manager.getHistories();
      assert.deepEqual(
        result.map((x) => x['id']),
        ['h2', 'h3', 'h1'],
      );
    });

    it('syncHistories 返回值也应按 updateTime 降序', () => {
      const result = manager.syncHistories([
        { id: 'h1', updateTime: '2026-01-01T00:00:00Z' },
        { id: 'h2', updateTime: '2026-01-03T00:00:00Z' },
        { id: 'h3', updateTime: '2026-01-02T00:00:00Z' },
      ]);

      assert.deepEqual(
        result.map((x) => x['id']),
        ['h2', 'h3', 'h1'],
      );
    });

    it('观看记录 updateTime 缺失时不应抛错且保持稳定', () => {
      manager.syncHistories([
        { id: 'h1', updateTime: '2026-01-01T00:00:00Z' },
        { id: 'h2' },
      ]);

      const result = manager.getHistories();
      assert.equal(result.length, 2);
      assert.equal(result[0]['id'], 'h1');
      assert.equal(result[1]['id'], 'h2');
    });

    it('删除观看记录后仍保持降序', () => {
      manager.syncHistories([
        { id: 'h1', updateTime: '2026-01-01T00:00:00Z' },
        { id: 'h2', updateTime: '2026-01-03T00:00:00Z' },
        { id: 'h3', updateTime: '2026-01-02T00:00:00Z' },
      ]);

      manager.deleteHistory('h2');
      const result = manager.getHistories();
      assert.deepEqual(
        result.map((x) => x['id']),
        ['h3', 'h1'],
      );
    });

    it('应正确同步屏蔽词（取并集）', () => {
      manager.syncBlockedWords(['广告', '刷屏']);

      const result = manager.syncBlockedWords(['广告', '挂机']);
      assert.equal(result.length, 3);
      assert.ok(result.includes('广告'));
      assert.ok(result.includes('刷屏'));
      assert.ok(result.includes('挂机'));
    });

    it('应正确同步设置', () => {
      manager.syncSettings({ theme: 'dark', quality: '1080p' });
      assert.equal(manager.getSettings()['theme'], 'dark');

      // 覆盖更新
      manager.syncSettings({ theme: 'light' });
      assert.equal(manager.getSettings()['theme'], 'light');
      assert.equal(manager.getSettings()['quality'], '1080p');
    });

    it('应正确管理 Cookie', () => {
      manager.setCookie('bilibili', 'cookie123');
      assert.equal(manager.getCookie('bilibili'), 'cookie123');

      manager.deleteCookie('bilibili');
      assert.equal(manager.getCookie('bilibili'), undefined);
    });
  });

  describe('SQLite 持久化模式', () => {
    it('重启后数据应恢复', () => {
      // 第一次实例：写入数据
      const manager1 = new SyncDataManager(TEST_DB_PATH);
      manager1.init();

      manager1.syncFollows([
        { id: 'f1', roomId: '111', userName: '主播A', addTime: '2026-01-01T00:00:00Z' },
        { id: 'f2', roomId: '222', userName: '主播B', addTime: '2026-01-02T00:00:00Z' },
      ]);

      manager1.syncHistories([
        { id: 'h1', roomId: '111', updateTime: '2026-01-01T00:00:00Z' },
      ]);

      manager1.syncBlockedWords(['广告', '刷屏']);
      manager1.syncSettings({ theme: 'dark' });
      manager1.setCookie('bilibili', 'cookie456');

      // 关闭（模拟服务停止）
      manager1.close();

      // 第二次实例：从 DB 重新加载
      const manager2 = new SyncDataManager(TEST_DB_PATH);
      manager2.init();

      // 验证关注列表恢复
      const follows = manager2.getFollows();
      assert.equal(follows.length, 2, '关注列表应恢复 2 条');

      // 验证观看记录恢复
      const histories = manager2.getHistories();
      assert.equal(histories.length, 1, '观看记录应恢复 1 条');
      assert.equal(histories[0]['id'], 'h1');

      // 验证屏蔽词恢复
      const blockedWords = manager2.getBlockedWords();
      assert.equal(blockedWords.length, 2, '屏蔽词应恢复 2 条');
      assert.ok(blockedWords.includes('广告'));
      assert.ok(blockedWords.includes('刷屏'));

      // 验证设置恢复
      const settings = manager2.getSettings();
      assert.equal(settings['theme'], 'dark');

      // 验证 Cookie 恢复
      assert.equal(manager2.getCookie('bilibili'), 'cookie456');

      manager2.close();
    });

    it('删除操作应持久化', () => {
      // 写入数据
      const manager1 = new SyncDataManager(TEST_DB_PATH);
      manager1.init();

      manager1.syncFollows([
        { id: 'f1', addTime: '2026-01-01T00:00:00Z' },
        { id: 'f2', addTime: '2026-01-02T00:00:00Z' },
      ]);
      manager1.deleteFollow('f1');
      manager1.close();

      // 重新加载
      const manager2 = new SyncDataManager(TEST_DB_PATH);
      manager2.init();

      const follows = manager2.getFollows();
      assert.equal(follows.length, 1, '删除的关注不应恢复');
      assert.equal(follows[0]['id'], 'f2');

      manager2.close();
    });

    it('重启后增量同步应正确合并', () => {
      // 写入初始数据
      const manager1 = new SyncDataManager(TEST_DB_PATH);
      manager1.init();
      manager1.syncFollows([
        { id: 'f1', addTime: '2026-01-01T00:00:00Z' },
      ]);
      manager1.close();

      // 重启后增量同步新数据
      const manager2 = new SyncDataManager(TEST_DB_PATH);
      manager2.init();

      const result = manager2.syncFollows([
        { id: 'f2', addTime: '2026-01-02T00:00:00Z' },
      ]);

      assert.equal(result.length, 2, '应包含旧数据 + 新数据');
      manager2.close();
    });
  });
});
