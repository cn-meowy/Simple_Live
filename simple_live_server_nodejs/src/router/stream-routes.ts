/**
 * 流播放端点路由
 *
 * 对应 Dart 版 simple_live_server/lib/router/stream_router.dart
 *
 * 挂载到 /api/v1/stream，提供播放端点和 HLS 静态文件路由。
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
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
 * 注册封面图片静态文件路由
 *
 * 挂载到 /api/v1/stream/covers/:filename，提供演示模式截取的封面图片。
 */
export function registerCoverRoute(
  app: FastifyInstance,
  coverDir: string,
): void {
  app.get('/api/v1/stream/covers/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const coverPath = path.join(coverDir, filename);

    // 安全检查：防止路径遍历
    const resolved = path.resolve(coverPath);
    if (!resolved.startsWith(path.resolve(coverDir))) {
      reply.code(403).send('Forbidden');
      return;
    }

    try {
      const stat = await fs.promises.stat(resolved);
      if (stat.isFile()) {
        reply.header('Content-Type', 'image/jpeg');
        reply.header('Cache-Control', 'public, max-age=86400');
        reply.header('Access-Control-Allow-Origin', '*');
        const data = await fs.promises.readFile(resolved);
        reply.send(data);
      } else {
        reply.code(404).send('Not Found');
      }
    } catch {
      reply.code(404).send('Not Found');
    }
  });
}

/**
 * 注册头像图片静态文件路由
 *
 * 挂载到 /api/v1/stream/avatars/:filename，提供演示模式截取的视频中间帧头像图片。
 * 实现与 registerCoverRoute 一致：路径遍历防护、image/jpeg、Cache-Control、CORS。
 */
export function registerAvatarRoute(
  app: FastifyInstance,
  avatarDir: string,
): void {
  app.get('/api/v1/stream/avatars/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const avatarPath = path.join(avatarDir, filename);

    // 安全检查：防止路径遍历
    const resolved = path.resolve(avatarPath);
    if (!resolved.startsWith(path.resolve(avatarDir))) {
      reply.code(403).send('Forbidden');
      return;
    }

    try {
      const stat = await fs.promises.stat(resolved);
      if (stat.isFile()) {
        reply.header('Content-Type', 'image/jpeg');
        reply.header('Cache-Control', 'public, max-age=86400');
        reply.header('Access-Control-Allow-Origin', '*');
        const data = await fs.promises.readFile(resolved);
        reply.send(data);
      } else {
        reply.code(404).send('Not Found');
      }
    } catch {
      reply.code(404).send('Not Found');
    }
  });
}

/**
 * 注册 HLS 静态文件路由
 *
 * 挂载到 /api/v1/stream/hls/<sessionId>/<path>，提供 ffmpeg 转封装生成的
 * m3u8 播放列表与 ts 分片。
 */
export function registerHlsRoute(
  app: FastifyInstance,
  streamManager: FfmpegStreamManager,
): void {
  // HLS 静态文件服务：/api/v1/stream/hls/<sessionId>/<path>
  app.get('/api/v1/stream/hls/:sessionId/*', async (req, reply) => {
    const params = req.params as { sessionId: string; '*': string };
    const sessionId = params.sessionId;
    const streamPath = streamManager.getStreamPath(sessionId);

    if (!streamPath) {
      // 会话不存在：可能是 ffmpeg 正在重启（短暂窗口）或会话已过期。
      // 返回 503 + Retry-After 引导播放器重试，而非 404 直接放弃——
      // 演示模式下 ffmpeg 异常退出后会话会自动重启，期间 m3u8 短暂不可用。
      reply.code(503);
      reply.header('Retry-After', '1');
      reply.header('Access-Control-Allow-Origin', '*');
      reply.send('Stream session not found');
      return;
    }

    // 用 Fastify 通配符参数获取 sessionId 之后的相对路径（已 URL 解码）。
    // 不能用 req.url 字符串截取：sessionId 含非 ASCII 字符（如中文文件名）
    // 时 req.url 仍是百分号编码形式，与解码后的 sessionId 拼出的 prefix 不
    // 匹配，会导致 indexOf 返回 -1、relativePath 错乱，最终 404。
    const relativePath = params['*'];

    // 安全检查：防止路径遍历
    const filePath = path.resolve(streamPath, relativePath);
    if (!filePath.startsWith(path.resolve(streamPath))) {
      reply.code(403).send('Forbidden');
      return;
    }

    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.isFile()) {
        // 根据文件扩展名设置 Content-Type
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.m3u8') {
          reply.header('Content-Type', 'application/vnd.apple.mpegurl');
        } else if (ext === '.ts') {
          reply.header('Content-Type', 'video/mp2t');
        }
        reply.header('Cache-Control', 'no-cache');
        reply.header('Access-Control-Allow-Origin', '*');

        const data = await fs.promises.readFile(filePath);
        reply.send(data);
      } else {
        reply.code(404).send('Not Found');
      }
    } catch {
      // m3u8 在 ffmpeg 重启期间可能短暂不存在（旧文件被清理、新文件尚未写出），
      // 返回 503 + Retry-After 引导播放器重试。
      if (path.extname(filePath).toLowerCase() === '.m3u8') {
        reply.code(503);
        reply.header('Retry-After', '1');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.send('Playlist temporarily unavailable');
        return;
      }

      // ts 分片缺失：演示模式本地流分片不删除，但播放器可能请求超出当前 m3u8
      // 窗口的序号。此时按 segmentCount 取余映射到首轮分片，实现循环播放兜底。
      // 取余命中失败（未启用 / 映射后仍不存在）则保持 404。
      if (path.extname(filePath).toLowerCase() === '.ts' &&
          await tryServeModuloSegment(reply, streamPath, filePath, streamManager, sessionId)) {
        return;
      }

      reply.code(404).send('Not Found');
    }
  });
}

/**
 * 演示模式本地流取余兜底：请求的 ts 分片序号超出当前 m3u8 窗口时，
 * 按 segmentCount 取余映射到首轮分片文件。
 *
 * @returns true 表示已通过取余命中并响应；false 表示未启用或映射后仍不存在（调用方应 404）
 */
async function tryServeModuloSegment(
  reply: FastifyReply,
  streamPath: string,
  requestedFilePath: string,
  streamManager: FfmpegStreamManager,
  sessionId: string,
): Promise<boolean> {
  const segmentCount = streamManager.getSegmentCount(sessionId);
  if (segmentCount <= 0) return false;

  // 从文件名解析序号：seg_%03d.ts → 数字部分
  const basename = path.basename(requestedFilePath);
  const match = basename.match(/^seg_(\d+)\.ts$/i);
  if (!match) return false;

  const requestedSeq = parseInt(match[1], 10);
  const mappedSeq = requestedSeq % segmentCount;
  // 与 ffmpeg -hls_segment_filename 的 %03d 格式一致：3 位补零
  const mappedName = `seg_${String(mappedSeq).padStart(3, '0')}.ts`;
  const mappedPath = path.resolve(streamPath, mappedName);

  // 安全检查：防止路径遍历（映射后仍在 streamPath 内）
  if (!mappedPath.startsWith(path.resolve(streamPath))) return false;

  try {
    const stat = await fs.promises.stat(mappedPath);
    if (!stat.isFile()) return false;

    reply.header('Content-Type', 'video/mp2t');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Access-Control-Allow-Origin', '*');
    const data = await fs.promises.readFile(mappedPath);
    reply.send(data);
    return true;
  } catch {
    return false;
  }
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
