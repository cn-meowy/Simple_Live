/**
 * 平台/分类/推荐/搜索 路由
 *
 * 对应 Dart 版 simple_live_server/lib/router/site_router.dart
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LiveSiteService } from '../service/live-site-service.js';
import { LiveSubCategory } from '../core/index.js';
import { sendJson, sendBadRequest, sendError, getPage } from './route-helpers.js';

/**
 * 注册平台/分类/推荐/搜索路由
 *
 * 所有路由挂载在 /api/v1 前缀下
 */
export async function registerSiteRoutes(
  app: FastifyInstance,
  service: LiveSiteService,
): Promise<void> {
  // 获取所有平台
  app.get('/api/v1/sites', async (_req: FastifyRequest, reply: FastifyReply) => {
    sendJson(reply, service.getSites());
  });

  // 获取分类列表
  app.get('/api/v1/sites/:siteId/categories', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId } = req.params as { siteId: string };
      const categories = await service.getCategories(siteId);
      sendJson(reply, categories.map((c) => LiveSiteService.categoryToJson(c)));
    } catch (e) {
      req.log.error({ err: e }, '获取分类列表失败');
      sendError(reply, e);
    }
  });

  // 获取推荐房间
  app.get('/api/v1/sites/:siteId/recommend', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId } = req.params as { siteId: string };
      const page = getPage(req.query as Record<string, unknown>);
      const result = await service.getRecommendRooms(siteId, page);
      sendJson(reply, LiveSiteService.categoryResultToJson(result));
    } catch (e) {
      req.log.error({ err: e }, '获取推荐房间失败');
      sendError(reply, e);
    }
  });

  // 获取分类下房间
  // categoryId 可能含逗号（虎牙/抖音），用 query 参数传递更安全
  app.get('/api/v1/sites/:siteId/categories/rooms', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId } = req.params as { siteId: string };
      const query = req.query as Record<string, unknown>;
      const page = getPage(query);
      const categoryId = query['categoryId'] as string | undefined;
      const parentId = (query['parentId'] as string) ?? '';
      const name = (query['name'] as string) ?? '';

      if (!categoryId) {
        sendBadRequest(reply, '缺少 categoryId 参数');
        return;
      }

      // 重建 LiveSubCategory
      const category = new LiveSubCategory(categoryId, name, parentId);

      const result = await service.getCategoryRooms(siteId, category, page);
      sendJson(reply, LiveSiteService.categoryResultToJson(result));
    } catch (e) {
      req.log.error({ err: e }, '获取分类下房间失败');
      sendError(reply, e);
    }
  });

  // 搜索直播间
  app.get('/api/v1/sites/:siteId/search/rooms', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId } = req.params as { siteId: string };
      const query = req.query as Record<string, unknown>;
      const keyword = (query['keyword'] as string) ?? '';
      const page = getPage(query);

      if (!keyword) {
        sendBadRequest(reply, '缺少 keyword 参数');
        return;
      }

      const result = await service.searchRooms(siteId, keyword, page);
      sendJson(reply, LiveSiteService.searchRoomResultToJson(result));
    } catch (e) {
      req.log.error({ err: e }, '搜索直播间失败');
      sendError(reply, e);
    }
  });

  // 搜索主播
  app.get('/api/v1/sites/:siteId/search/anchors', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId } = req.params as { siteId: string };
      const query = req.query as Record<string, unknown>;
      const keyword = (query['keyword'] as string) ?? '';
      const page = getPage(query);

      if (!keyword) {
        sendBadRequest(reply, '缺少 keyword 参数');
        return;
      }

      const result = await service.searchAnchors(siteId, keyword, page);
      sendJson(reply, LiveSiteService.searchAnchorResultToJson(result));
    } catch (e) {
      req.log.error({ err: e }, '搜索主播失败');
      sendError(reply, e);
    }
  });
}
