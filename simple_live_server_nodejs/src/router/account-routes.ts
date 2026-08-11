/**
 * 账号路由
 *
 * 挂载到 /api/v1/sites/:siteId/account，提供扫码登录、Cookie、用户名管理接口。
 *
 * 端点：
 * - POST /qr/generate       生成二维码（仅 bilibili）
 * - GET  /qr/poll           轮询扫码状态（仅 bilibili）
 * - GET  /username          读取用户名
 * - PUT  /username          写入用户名
 * - DELETE /username        删除用户名
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LiveSiteService } from '../service/live-site-service.js';
import { SyncDataManager } from '../service/sync-data-manager.js';
import { sendJson, sendBadRequest, sendError, sendCustomError } from './route-helpers.js';

/**
 * 注册账号路由
 */
export async function registerAccountRoutes(
  app: FastifyInstance,
  service: LiveSiteService,
  manager: SyncDataManager,
): Promise<void> {

  // POST /api/v1/sites/:siteId/account/qr/generate - 生成二维码
  app.post(
    '/api/v1/sites/:siteId/account/qr/generate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { siteId } = req.params as { siteId: string };

        if (siteId !== 'bilibili') {
          sendCustomError(reply, 404, `平台 ${siteId} 不支持扫码登录`);
          return;
        }

        const result = await service.generateBilibiliQR();
        sendJson(reply, result);
      } catch (e) {
        req.log.error({ err: e }, '生成二维码失败');
        sendError(reply, e);
      }
    },
  );

  // GET /api/v1/sites/:siteId/account/qr/poll - 轮询扫码状态
  app.get(
    '/api/v1/sites/:siteId/account/qr/poll',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { siteId } = req.params as { siteId: string };
        const query = req.query as Record<string, unknown>;

        if (siteId !== 'bilibili') {
          sendCustomError(reply, 404, `平台 ${siteId} 不支持扫码登录`);
          return;
        }

        const qrcodeKey = query['qrcodeKey'] as string | undefined;
        if (!qrcodeKey) {
          sendBadRequest(reply, '缺少 qrcodeKey 参数');
          return;
        }

        const result = await service.pollBilibiliQR(qrcodeKey);
        sendJson(reply, result);
      } catch (e) {
        req.log.error({ err: e }, '轮询扫码状态失败');
        sendError(reply, e);
      }
    },
  );

  // GET /api/v1/sites/:siteId/account/username - 读取用户名
  app.get(
    '/api/v1/sites/:siteId/account/username',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { siteId } = req.params as { siteId: string };
        const username = manager.getUsername(siteId);
        sendJson(reply, { username: username ?? '' });
      } catch (e) {
        req.log.error({ err: e }, '读取用户名失败');
        sendError(reply, e);
      }
    },
  );

  // PUT /api/v1/sites/:siteId/account/username - 写入用户名
  app.put(
    '/api/v1/sites/:siteId/account/username',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { siteId } = req.params as { siteId: string };
        const body = req.body as Record<string, unknown> | undefined;

        if (!body) {
          sendBadRequest(reply, '请求体不能为空');
          return;
        }

        const username = body['username'] as string | undefined;
        if (username === undefined || username === null) {
          sendBadRequest(reply, 'username 字段不能为空');
          return;
        }

        manager.setUsername(siteId, username);
        sendJson(reply, { siteId, username });
      } catch (e) {
        req.log.error({ err: e }, '写入用户名失败');
        sendError(reply, e);
      }
    },
  );

  // DELETE /api/v1/sites/:siteId/account/username - 删除用户名
  app.delete(
    '/api/v1/sites/:siteId/account/username',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { siteId } = req.params as { siteId: string };
        manager.deleteUsername(siteId);
        sendJson(reply, { siteId, deleted: true });
      } catch (e) {
        req.log.error({ err: e }, '删除用户名失败');
        sendError(reply, e);
      }
    },
  );
}
