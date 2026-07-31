/**
 * Simple Live Server - Fastify 应用
 *
 * 对应 Dart 版 simple_live_server/lib/server.dart
 *
 * 组装所有路由、插件、中间件，启动 HTTP 服务。
 */

import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import * as fs from 'fs';
import * as path from 'path';

import { ServerConfig } from './config/server-config.js';
import { CoreLog } from './core/index.js';
import { ApiResponse } from './dto/api-response.js';
import { LiveSiteService } from './service/live-site-service.js';
import { DanmakuManager } from './service/danmaku-manager.js';
import { FfmpegStreamManager } from './service/ffmpeg-stream-manager.js';
import { SyncDataManager } from './service/sync-data-manager.js';
import { registerSiteRoutes } from './router/site-routes.js';
import { registerRoomRoutes } from './router/room-routes.js';
import { registerStreamRoutes } from './router/stream-routes.js';
import { registerDanmakuRoutes } from './router/danmaku-routes.js';
import { registerSyncRoutes } from './router/sync-routes.js';
import { registerCookieRoutes } from './router/cookie-routes.js';

/**
 * Simple Live Server 主类
 *
 * 组装所有路由，启动 HTTP 服务。
 */
export class SimpleLiveServer {
  readonly config: ServerConfig;
  readonly service: LiveSiteService;
  readonly danmakuManager: DanmakuManager;
  readonly syncDataManager: SyncDataManager;
  readonly streamManager: FfmpegStreamManager;

  private app: FastifyInstance | null = null;

  constructor(config: ServerConfig) {
    this.config = config;
    this.service = new LiveSiteService(config);
    this.danmakuManager = new DanmakuManager(
      this.service,
      config.maxDanmakuConnections,
    );
    this.syncDataManager = new SyncDataManager(config.syncDbPath);
    this.streamManager = new FfmpegStreamManager({
      streamDir: config.streamDir,
      maxSessions: config.maxStreamSessions,
      idleTimeoutSeconds: config.streamIdleTimeout,
    });
  }

  /**
   * 初始化日志
   */
  private initLog(): void {
    CoreLog.enableLog = this.config.enableLog;
    if (this.config.enableLog) {
      CoreLog.onPrintLog = (level, message) => {
        console.log(`[${level}] ${message}`);
      };
    }
  }

  /**
   * 构建 Fastify 应用
   */
  async buildApp(): Promise<FastifyInstance> {
    const app = Fastify({
      logger: this.config.enableLog
        ? {
            level: 'info',
          }
        : false,
    });

    // 注册插件
    await app.register(fastifyCors, {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id'],
    });

    await app.register(fastifyWebsocket, {
      options: {
        maxPayload: 1024 * 1024, // 1MB
      },
    });

    // 全局错误处理器：捕获所有未 try-catch 的异常，记录完整错误详情
    app.setErrorHandler((error, request, reply) => {
      const err = error as Error & { statusCode?: number };
      const statusCode = err.statusCode ?? 500;
      request.log.error(
        {
          method: request.method,
          url: request.url,
          params: request.params,
          query: request.query,
          body: request.body,
          statusCode,
          err,
        },
        `请求处理失败: ${err.message}`,
      );

      // 保持与现有 API 响应格式一致
      reply
        .code(statusCode)
        .send(ApiResponse.error(statusCode, err.message));
    });

    // 注册所有路由
    registerSiteRoutes(app, this.service);
    registerRoomRoutes(app, this.service);
    registerStreamRoutes(app, {
      streamManager: this.streamManager,
      service: this.service,
      host: `${this.config.host}:${this.config.port}`,
    });
    registerDanmakuRoutes(app, this.danmakuManager);
    registerSyncRoutes(app, this.syncDataManager);
    registerCookieRoutes(app, this.syncDataManager);

    // 封面图片静态文件服务：/api/v1/stream/covers/:filename
    app.get('/api/v1/stream/covers/:filename', async (req, reply) => {
      const { filename } = req.params as { filename: string };
      const coverPath = path.join(this.config.coverDir, filename);

      // 安全检查：防止路径遍历
      const resolved = path.resolve(coverPath);
      if (!resolved.startsWith(path.resolve(this.config.coverDir))) {
        reply.code(403).send('Forbidden');
        return;
      }

      try {
        const stat = await fs.promises.stat(resolved);
        if (stat.isFile()) {
          reply.header('Content-Type', 'image/jpeg');
          reply.header('Cache-Control', 'public, max-age=86400');
          reply.header('Access-Control-Allow-Origin', '*');
          const stream = fs.createReadStream(resolved);
          reply.send(stream);
        } else {
          reply.code(404).send('Not Found');
        }
      } catch {
        reply.code(404).send('Not Found');
      }
    });

    // HLS 静态文件服务：/api/v1/stream/hls/<sessionId>/<path>
    app.get('/api/v1/stream/hls/:sessionId/*', async (req, reply) => {
      const params = req.params as { sessionId: string };
      const sessionId = params.sessionId;
      const streamPath = this.streamManager.getStreamPath(sessionId);

      if (!streamPath) {
        reply.code(404).send('Stream session not found');
        return;
      }

      // 从 URL 中提取 sessionId 之后的相对路径
      const url = req.url;
      const prefix = `/api/v1/stream/hls/${sessionId}/`;
      const relativePath = url.substring(url.indexOf(prefix) + prefix.length);

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

          const stream = fs.createReadStream(filePath);
          reply.send(stream);
        } else {
          reply.code(404).send('Not Found');
        }
      } catch {
        reply.code(404).send('Not Found');
      }
    });

    // 健康检查
    app.get('/health', async (_req, reply) => {
      reply.send('ok');
    });

    // 根路径
    app.get('/', async (_req, reply) => {
      reply.send('Simple Live Server is running');
    });

    return app;
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    this.initLog();

    // 确保流目录存在
    try {
      await fs.promises.mkdir(this.config.streamDir, { recursive: true });
    } catch {
      // ignore
    }

    // 确保封面图片目录存在（演示模式截帧用）
    try {
      await fs.promises.mkdir(this.config.coverDir, { recursive: true });
    } catch {
      // ignore
    }

    // 初始化同步数据（从 SQLite 加载到内存）
    try {
      this.syncDataManager.init();
    } catch (err) {
      console.error('加载同步数据失败:', err);
    }

    // 加载本地视频数据（local 平台）
    try {
      await this.service.loadLocalData();
    } catch (err) {
      console.error('加载本地视频数据失败:', err);
    }

    this.app = await this.buildApp();

    try {
      await this.app.listen({
        port: this.config.port,
        host: this.config.host,
      });

      console.log(`
╔══════════════════════════════════════════════╗
║   Simple Live Server 已启动                    ║
║   监听: http://${this.config.host}:${this.config.port}              ║
║   API:  /api/v1                                ║
║   WS:   /api/v1/sites/{id}/rooms/{id}/danmaku ║
║   弹幕连接上限: ${this.config.maxDanmakuConnections}                          ║
║   转封装会话上限: ${this.config.maxStreamSessions}                          ║
╚══════════════════════════════════════════════╝
`);
    } catch (err) {
      console.error('服务启动失败:', err);
      process.exit(1);
    }
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    if (this.app) {
      await this.app.close();
      this.app = null;
    }
    await this.streamManager.dispose();
    this.syncDataManager.close();
  }
}
