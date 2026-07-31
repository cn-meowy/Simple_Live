/**
 * 同步路由
 *
 * 对应 Dart 版 simple_live_server/lib/router/sync_router.dart
 *
 * 挂载到 /api/v1/sync，提供关注列表、标签、观看记录、屏蔽词、设置的同步接口。
 * 统一管理（不区分设备），所有客户端共享同一份数据。
 * POST 接口执行并集合并后返回完整数据集，GET 接口仅拉取服务端数据。
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SyncDataManager } from '../service/sync-data-manager.js';
import { sendJson, sendBadRequest, sendError } from './route-helpers.js';

/**
 * 注册同步路由
 */
export async function registerSyncRoutes(
  app: FastifyInstance,
  manager: SyncDataManager,
): Promise<void> {
  // ============ 关注列表 ============

  // GET /api/v1/sync/follow - 拉取关注列表
  app.get('/api/v1/sync/follow', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = manager.getFollows();
      sendJson(reply, data);
    } catch (e) {
      req.log.error({ err: e }, '拉取关注列表失败');
      sendError(reply, e);
    }
  });

  // POST /api/v1/sync/follow - 同步关注列表
  app.post('/api/v1/sync/follow', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as unknown[];

      if (!Array.isArray(body)) {
        sendBadRequest(reply, '请求体不能为空，需为数组格式');
        return;
      }

      const clientData = body as Array<Record<string, unknown>>;
      const merged = manager.syncFollows(clientData);
      sendJson(reply, merged);
    } catch (e) {
      req.log.error({ err: e }, '同步关注列表失败');
      sendError(reply, e);
    }
  });

  // DELETE /api/v1/sync/follow/:id - 删除指定关注
  app.delete('/api/v1/sync/follow/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as { id: string };
      if (!id) {
        sendBadRequest(reply, '缺少关注 id 参数');
        return;
      }
      const data = manager.deleteFollow(id);
      sendJson(reply, data);
    } catch (e) {
      req.log.error({ err: e }, '删除关注失败');
      sendError(reply, e);
    }
  });

  // ============ 标签 ============

  // GET /api/v1/sync/tag - 拉取标签
  app.get('/api/v1/sync/tag', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = manager.getTags();
      sendJson(reply, data);
    } catch (e) {
      req.log.error({ err: e }, '拉取标签失败');
      sendError(reply, e);
    }
  });

  // POST /api/v1/sync/tag - 同步标签
  app.post('/api/v1/sync/tag', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as unknown[];

      if (!Array.isArray(body)) {
        sendBadRequest(reply, '请求体不能为空，需为数组格式');
        return;
      }

      const clientData = body as Array<Record<string, unknown>>;
      const merged = manager.syncTags(clientData);
      sendJson(reply, merged);
    } catch (e) {
      req.log.error({ err: e }, '同步标签失败');
      sendError(reply, e);
    }
  });

  // ============ 观看记录 ============

  // GET /api/v1/sync/history - 拉取观看记录
  app.get('/api/v1/sync/history', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = manager.getHistories();
      sendJson(reply, data);
    } catch (e) {
      req.log.error({ err: e }, '拉取观看记录失败');
      sendError(reply, e);
    }
  });

  // POST /api/v1/sync/history - 同步观看记录
  app.post('/api/v1/sync/history', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as unknown[];

      if (!Array.isArray(body)) {
        sendBadRequest(reply, '请求体不能为空，需为数组格式');
        return;
      }

      const clientData = body as Array<Record<string, unknown>>;
      const merged = manager.syncHistories(clientData);
      sendJson(reply, merged);
    } catch (e) {
      req.log.error({ err: e }, '同步观看记录失败');
      sendError(reply, e);
    }
  });

  // DELETE /api/v1/sync/history/:id - 删除指定观看记录
  app.delete('/api/v1/sync/history/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as { id: string };
      if (!id) {
        sendBadRequest(reply, '缺少记录 id 参数');
        return;
      }
      const data = manager.deleteHistory(id);
      sendJson(reply, data);
    } catch (e) {
      req.log.error({ err: e }, '删除观看记录失败');
      sendError(reply, e);
    }
  });

  // ============ 屏蔽词 ============

  // GET /api/v1/sync/blocked_word - 拉取屏蔽词
  app.get('/api/v1/sync/blocked_word', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = manager.getBlockedWords();
      sendJson(reply, data);
    } catch (e) {
      req.log.error({ err: e }, '拉取屏蔽词失败');
      sendError(reply, e);
    }
  });

  // POST /api/v1/sync/blocked_word - 同步屏蔽词
  app.post('/api/v1/sync/blocked_word', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as unknown[];

      if (!Array.isArray(body)) {
        sendBadRequest(reply, '请求体不能为空，需为数组格式');
        return;
      }

      const clientData = body as string[];
      const merged = manager.syncBlockedWords(clientData);
      sendJson(reply, merged);
    } catch (e) {
      req.log.error({ err: e }, '同步屏蔽词失败');
      sendError(reply, e);
    }
  });

  // ============ 设置 ============

  // GET /api/v1/sync/settings - 拉取设置
  app.get('/api/v1/sync/settings', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = manager.getSettings();
      sendJson(reply, data);
    } catch (e) {
      req.log.error({ err: e }, '拉取设置失败');
      sendError(reply, e);
    }
  });

  // POST /api/v1/sync/settings - 同步设置
  app.post('/api/v1/sync/settings', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as Record<string, unknown> | undefined;

      if (!body || typeof body !== 'object') {
        sendBadRequest(reply, '请求体不能为空，需为对象格式');
        return;
      }

      const merged = manager.syncSettings(body);
      sendJson(reply, merged);
    } catch (e) {
      req.log.error({ err: e }, '同步设置失败');
      sendError(reply, e);
    }
  });
}
