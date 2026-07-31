/**
 * 流播放端点路由
 *
 * 对应 Dart 版 simple_live_server/lib/router/stream_router.dart
 *
 * 挂载到 /api/v1/stream，提供播放端点和 HLS 静态文件路由。
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as path from 'path';
import { LiveSiteService } from '../service/live-site-service.js';
import { FfmpegStreamManager, StreamSessionLimitException } from '../service/ffmpeg-stream-manager.js';
import { LivePlayQuality } from '../core/index.js';
import { sendJson, sendBadRequest, sendCustomError, sendError } from './route-helpers.js';

export interface StreamRouterOptions {
  streamManager: FfmpegStreamManager;
  service: LiveSiteService;
  host: string;
}

/**
 * 注册流播放端点路由
 */
export async function registerStreamRoutes(
  app: FastifyInstance,
  options: StreamRouterOptions,
): Promise<void> {
  const { streamManager, service, host } = options;

  // GET /api/v1/stream/playback?siteId=&roomId=&quality=
  //
  // 流程：
  // - local 平台：获取详情（含 filePath）-> 直接用 ffmpeg 转本地文件为 HLS
  // - 其他平台：获取详情 -> 获取清晰度 -> 选中 -> 获取直链 -> 判断格式 ->
  //   HLS 直接重定向 / FLV 启动 ffmpeg 转封装
  app.get('/api/v1/stream/playback', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = req.query as Record<string, unknown>;
      const siteId = query['siteId'] as string | undefined;
      const roomId = query['roomId'] as string | undefined;
      const quality = (query['quality'] as string) ?? '原画';

      if (!siteId) {
        sendBadRequest(reply, '缺少 siteId 参数');
        return;
      }
      if (!roomId) {
        sendBadRequest(reply, '缺少 roomId 参数');
        return;
      }

      // local 平台：本地文件直接转 HLS
      if (siteId === 'local') {
        const detail = await service.getRoomDetail(siteId, roomId);
        const localData = detail.data as { filePath?: string } | undefined;
        const filePath = localData?.filePath;

        if (!filePath) {
          sendCustomError(reply, 500, '本地房间缺少文件路径');
          return;
        }

        const session = await streamManager.getOrCreateLocalStream(filePath, siteId, roomId);
        const fullHlsUrl = `http://${host}${session.hlsUrl}`;
        sendJson(reply, { type: 'hls', url: fullHlsUrl, sessionId: session.sessionId });
        return;
      }

      // 1. 获取房间详情
      const detail = await service.getRoomDetail(siteId, roomId);

      // 2. 获取清晰度列表
      const qualities = await service.getPlayQualites(siteId, detail);

      // 3. 选中清晰度
      const selectedQuality = selectQuality(qualities, quality);

      // 4. 获取播放直链
      const playUrl = await service.getPlayUrls(siteId, detail, selectedQuality);
      const url = playUrl.urls.length > 0 ? playUrl.urls[0] : '';

      if (!url) {
        sendCustomError(reply, 500, '获取播放直链失败');
        return;
      }

      // 5. 判断格式
      if (isHlsUrl(url)) {
        sendJson(reply, { type: 'redirect', url });
      } else {
        const session = await streamManager.getOrCreateStream(siteId, roomId, url);
        const fullHlsUrl = `http://${host}${session.hlsUrl}`;
        sendJson(reply, { type: 'hls', url: fullHlsUrl, sessionId: session.sessionId });
      }
    } catch (e) {
      if (e instanceof StreamSessionLimitException) {
        req.log.warn({ err: e }, '转封装会话已达上限');
        sendCustomError(reply, 503, e.message);
      } else {
        req.log.error({ err: e }, '获取播放端点失败');
        sendCustomError(reply, 500, e instanceof Error ? e.message : String(e));
      }
    }
  });

  // POST /api/v1/stream/transcode
  //
  // 客户端传入 FLV 直链，后端启动 ffmpeg 转封装并返回 HLS 地址。
  // 请求体：{ "url": "flv直链", "siteId": "...", "roomId": "..." }
  // 响应：{ "type": "hls", "url": "http://host/api/v1/stream/hls/xxx/play.m3u8", "sessionId": "xxx" }
  // 若 url 已是 HLS，直接返回 redirect，无需转封装。
  app.post('/api/v1/stream/transcode', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as Record<string, unknown> | undefined;
      if (!body) {
        sendBadRequest(reply, '请求体不能为空，需包含 url、siteId、roomId');
        return;
      }

      const url = body['url'] as string | undefined;
      const siteId = (body['siteId'] as string) ?? 'unknown';
      const roomId = (body['roomId'] as string) ?? 'unknown';

      if (!url) {
        sendBadRequest(reply, '缺少 url 参数');
        return;
      }

      // 已是 HLS，无需转换，直接返回 redirect
      if (isHlsUrl(url)) {
        sendJson(reply, { type: 'redirect', url });
        return;
      }

      const session = await streamManager.getOrCreateStream(siteId, roomId, url);
      const fullHlsUrl = `http://${host}${session.hlsUrl}`;
      sendJson(reply, { type: 'hls', url: fullHlsUrl, sessionId: session.sessionId });
    } catch (e) {
      if (e instanceof StreamSessionLimitException) {
        req.log.warn({ err: e }, '转封装会话已达上限');
        sendCustomError(reply, 503, e.message);
      } else {
        req.log.error({ err: e }, 'FLV 转 HLS 失败');
        sendCustomError(reply, 500, e instanceof Error ? e.message : String(e));
      }
    }
  });
}

/**
 * 选中指定清晰度：精确匹配优先，回退到 sort 最小
 */
function selectQuality(qualities: LivePlayQuality[], qualityName: string): LivePlayQuality {
  for (const q of qualities) {
    if (q.quality === qualityName) return q;
  }
  for (const q of qualities) {
    if (q.quality.includes(qualityName) || qualityName.includes(q.quality)) return q;
  }
  if (qualities.length > 0) {
    const sorted = [...qualities].sort((a, b) => a.sort - b.sort);
    return sorted[0];
  }
  throw new Error('没有可用的清晰度');
}

/**
 * 判断 URL 是否为 HLS 格式
 */
function isHlsUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith('.m3u8') || lower.includes('.m3u8?');
}
