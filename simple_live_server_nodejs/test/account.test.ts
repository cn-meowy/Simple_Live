/**
 * 账号模块单元测试
 *
 * 覆盖：
 * - LiveSiteService.getSites() 返回 account 字段
 * - SyncDataManager username 读写往返
 * - SyncDataManager username SQLite 持久化（重启恢复）
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SyncDataManager } from '../src/service/sync-data-manager.js';
import { LiveSiteService } from '../src/service/live-site-service.js';
import { ServerConfig } from '../src/config/server-config.js';

const TEST_DB_DIR = path.join(import.meta.dirname, 'test_db_account');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test_account.db');

describe('账号模块', () => {
  before(async () => {
    await fs.mkdir(TEST_DB_DIR, { recursive: true });
  });

  after(async () => {
    await fs.rm(TEST_DB_DIR, { recursive: true, force: true });
  });

  describe('LiveSiteService.getSites() account 字段', () => {
    it('非演示模式应返回 bilibili(qr)、douyin(cookie)、douyu(null)、huya(null)', () => {
      const config = new ServerConfig({ demoMode: false });
      const service = new LiveSiteService(config);
      const sites = service.getSites();

      const bilibili = sites.find((s) => s.id === 'bilibili');
      assert.ok(bilibili, 'bilibili 应在列表中');
      assert.ok(bilibili!.account, 'bilibili 应有 account 描述符');
      assert.equal(bilibili!.account!.type, 'qr');

      const douyin = sites.find((s) => s.id === 'douyin');
      assert.ok(douyin, 'douyin 应在列表中');
      assert.ok(douyin!.account, 'douyin 应有 account 描述符');
      assert.equal(douyin!.account!.type, 'cookie');

      const douyu = sites.find((s) => s.id === 'douyu');
      assert.ok(douyu, 'douyu 应在列表中');
      assert.equal(douyu!.account, null, 'douyu account 应为 null');

      const huya = sites.find((s) => s.id === 'huya');
      assert.ok(huya, 'huya 应在列表中');
      assert.equal(huya!.account, null, 'huya account 应为 null');

      // 非演示模式不返回 local
      const local = sites.find((s) => s.id === 'local');
      assert.equal(local, undefined, '非演示模式不应返回 local');
    });

    it('演示模式应返回 local(username)，且只有 local', () => {
      const config = new ServerConfig({ demoMode: true });
      const service = new LiveSiteService(config);
      const sites = service.getSites();

      assert.equal(sites.length, 1, '演示模式应只返回 1 个站点');
      assert.equal(sites[0].id, 'local');
      assert.ok(sites[0].account, 'local 应有 account 描述符');
      assert.equal(sites[0].account!.type, 'username');
    });

    it('account 描述符应包含 label 和 hint', () => {
      const config = new ServerConfig({ demoMode: false });
      const service = new LiveSiteService(config);
      const sites = service.getSites();

      const bilibili = sites.find((s) => s.id === 'bilibili')!;
      assert.ok(bilibili.account!.label.length > 0, 'label 不应为空');
      assert.ok(bilibili.account!.hint.length > 0, 'hint 不应为空');
    });
  });

  describe('SyncDataManager username 管理（纯内存模式）', () => {
    let manager: SyncDataManager;

    beforeEach(() => {
      manager = new SyncDataManager();
    });

    it('应正确读写用户名', () => {
      manager.setUsername('local', '测试用户');
      assert.equal(manager.getUsername('local'), '测试用户');
    });

    it('未设置时应返回 undefined', () => {
      assert.equal(manager.getUsername('local'), undefined);
    });

    it('应正确删除用户名', () => {
      manager.setUsername('local', '测试用户');
      manager.deleteUsername('local');
      assert.equal(manager.getUsername('local'), undefined);
    });

    it('应支持覆盖更新', () => {
      manager.setUsername('local', '用户A');
      manager.setUsername('local', '用户B');
      assert.equal(manager.getUsername('local'), '用户B');
    });

    it('应支持多站点独立存储', () => {
      manager.setUsername('local', '本地用户');
      manager.setUsername('bilibili', 'B站用户');
      assert.equal(manager.getUsername('local'), '本地用户');
      assert.equal(manager.getUsername('bilibili'), 'B站用户');
    });
  });

  describe('SyncDataManager username SQLite 持久化', () => {
    it('重启后用户名应恢复', () => {
      const manager1 = new SyncDataManager(TEST_DB_PATH);
      manager1.init();
      manager1.setUsername('local', '持久化用户');
      manager1.close();

      const manager2 = new SyncDataManager(TEST_DB_PATH);
      manager2.init();
      assert.equal(manager2.getUsername('local'), '持久化用户');
      manager2.close();
    });

    it('删除操作应持久化', () => {
      const manager1 = new SyncDataManager(TEST_DB_PATH);
      manager1.init();
      manager1.setUsername('local', '待删除');
      manager1.deleteUsername('local');
      manager1.close();

      const manager2 = new SyncDataManager(TEST_DB_PATH);
      manager2.init();
      assert.equal(manager2.getUsername('local'), undefined);
      manager2.close();
    });
  });
});
