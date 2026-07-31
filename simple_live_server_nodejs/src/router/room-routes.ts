/**
 * 房间/播放/SC 路由
 *
 * 对应 Dart 版 simple_live_server/lib/router/room_router.dart
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LiveSiteService } from '../service/live-site-service.js';
import { sendJson, sendBadRequest, sendError } from './route-helpers.js';

/**
 * 注册房间/播放/SC 路由
 *
 * 所有路由挂载在 /api/v1 前缀下
 */
export async function registerRoomRoutes(
  app: FastifyInstance,
  service: LiveSiteService,
): Promise<void> {
  // 房间详情
  app.get('/api/v1/sites/:siteId/rooms/:roomId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId, roomId } = req.params as { siteId: string; roomId: string };
      const detail = await service.getRoomDetail(siteId, roomId);
      sendJson(reply, LiveSiteService.roomDetailToJson(detail));
    } catch (e) {
      req.log.error({ err: e }, '获取房间详情失败');
      sendError(reply, e);
    }
  });

  // 直播状态
  app.get('/api/v1/sites/:siteId/rooms/:roomId/live-status', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId, roomId } = req.params as { siteId: string; roomId: string };
      const status = await service.getLiveStatus(siteId, roomId);
      sendJson(reply, { liveStatus: status });
    } catch (e) {
      req.log.error({ err: e }, '获取直播状态失败');
      sendError(reply, e);
    }
  });

  // 清晰度列表
  app.get('/api/v1/sites/:siteId/rooms/:roomId/qualities', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId, roomId } = req.params as { siteId: string; roomId: string };
      // 获取清晰度需要先拿到房间详情
      const detail = await service.getRoomDetail(siteId, roomId);
      const qualities = await service.getPlayQualites(siteId, detail);
      sendJson(reply, qualities.map((q) => LiveSiteService.playQualityToJson(q)));
    } catch (e) {
      req.log.error({ err: e }, '获取清晰度列表失败');
      sendError(reply, e);
    }
  });

  // 播放直链
  app.post('/api/v1/sites/:siteId/rooms/:roomId/play-urls', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId } = req.params as { siteId: string };
      const body = req.body as Record<string, unknown> | undefined;

      if (!body) {
        sendBadRequest(reply, '请求体不能为空，需包含 detail 和 quality');
        return;
      }

      const detailJson = body['detail'] as Record<string, unknown> | undefined;
      const qualityJson = body['quality'] as Record<string, unknown> | undefined;

      if (!detailJson || !qualityJson) {
        sendBadRequest(reply, '请求体需包含 detail 和 quality 字段');
        return;
      }

      // 重建对象
      const detail = LiveSiteService.roomDetailFromJson(detailJson);
      const quality = LiveSiteService.playQualityFromJson(qualityJson, siteId);

      const playUrl = await service.getPlayUrls(siteId, detail, quality);
      sendJson(reply, LiveSiteService.playUrlToJson(playUrl));
    } catch (e) {
      req.log.error({ err: e }, '获取播放直链失败');
      sendError(reply, e);
    }
  });

  // SC 消息
  app.get('/api/v1/sites/:siteId/rooms/:roomId/super-chat', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId, roomId } = req.params as { siteId: string; roomId: string };
      const scList = await service.getSuperChatMessage(siteId, roomId);
      sendJson(reply, scList.map((sc) => LiveSiteService.superChatToJson(sc)));
    } catch (e) {
      req.log.error({ err: e }, '获取 SC 消息失败');
      sendError(reply, e);
    }
  });
}
