/**
 * Cookie 路由
 *
 * 对应 Dart 版 simple_live_server/lib/router/cookie_router.dart
 *
 * 挂载到 /api/v1/cookie，提供各平台 Cookie 的获取、上传、删除接口。
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SyncDataManager } from '../service/sync-data-manager.js';
import { sendJson, sendBadRequest, sendError } from './route-helpers.js';

/**
 * 注册 Cookie 路由
 */
export async function registerCookieRoutes(
  app: FastifyInstance,
  manager: SyncDataManager,
): Promise<void> {
  // GET /api/v1/cookie/:siteId - 获取指定平台 Cookie
  app.get('/api/v1/cookie/:siteId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId } = req.params as { siteId: string };
      const cookie = manager.getCookie(siteId);
      sendJson(reply, { cookie: cookie ?? '' });
    } catch (e) {
      req.log.error({ err: e }, '获取 Cookie 失败');
      sendError(reply, e);
    }
  });

  // PUT /api/v1/cookie/:siteId - 上传/更新指定平台 Cookie
  app.put('/api/v1/cookie/:siteId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId } = req.params as { siteId: string };
      const body = req.body as Record<string, unknown> | undefined;

      if (!body) {
        sendBadRequest(reply, '请求体不能为空');
        return;
      }

      const cookie = body['cookie'] as string | undefined;
      if (!cookie) {
        sendBadRequest(reply, 'cookie 字段不能为空');
        return;
      }

      manager.setCookie(siteId, cookie);
      sendJson(reply, { siteId, cookie });
    } catch (e) {
      req.log.error({ err: e }, '更新 Cookie 失败');
      sendError(reply, e);
    }
  });

  // DELETE /api/v1/cookie/:siteId - 清除指定平台 Cookie
  app.delete('/api/v1/cookie/:siteId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId } = req.params as { siteId: string };
      manager.deleteCookie(siteId);
      sendJson(reply, { siteId, deleted: true });
    } catch (e) {
      req.log.error({ err: e }, '删除 Cookie 失败');
      sendError(reply, e);
    }
  });
}
