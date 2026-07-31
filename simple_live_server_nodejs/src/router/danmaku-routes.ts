/**
 * 弹幕 WebSocket 路由
 *
 * 对应 Dart 版 simple_live_server/lib/router/danmaku_router.dart
 *
 * 使用 @fastify/websocket 提供弹幕 WebSocket 连接。
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebsocketHandler } from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { DanmakuManager } from '../service/danmaku-manager.js';

/**
 * 注册弹幕 WebSocket 路由
 *
 * 路由路径格式：/api/v1/sites/{siteId}/rooms/{roomId}/danmaku
 */
export async function registerDanmakuRoutes(
  app: FastifyInstance,
  manager: DanmakuManager,
): Promise<void> {
  const handler: WebsocketHandler = async (socket: WebSocket, req: FastifyRequest) => {
    const { siteId, roomId } = req.params as { siteId: string; roomId: string };
    // Fastify @fastify/websocket 的 socket 就是 ws.WebSocket 实例
    await manager.handleConnection(socket, siteId, roomId);
  };

  app.get(
    '/api/v1/sites/:siteId/rooms/:roomId/danmaku',
    { websocket: true },
    handler,
  );
}
