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

import { ServerConfig } from './config/server-config.js';
import { CoreLog } from './core/index.js';
import { ApiResponse } from './dto/api-response.js';
import { LiveSiteService } from './service/live-site-service.js';
import { DanmakuManager } from './service/danmaku-manager.js';
import { FfmpegStreamManager } from './service/ffmpeg-stream-manager.js';
import { SyncDataManager } from './service/sync-data-manager.js';
import { registerSiteRoutes } from './router/site-routes.js';
import { registerRoomRoutes } from './router/room-routes.js';
import { registerStreamRoutes, registerHlsRoute, registerCoverRoute, registerAvatarRoute } from './router/stream-routes.js';
import { registerDanmakuRoutes } from './router/danmaku-routes.js';
import { registerSyncRoutes } from './router/sync-routes.js';
import { registerCookieRoutes } from './router/cookie-routes.js';
import { registerAccountRoutes } from './router/account-routes.js';

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
    registerRoomRoutes(app, {
      service: this.service,
      streamManager: this.streamManager,
    });
    registerStreamRoutes(app, {
      streamManager: this.streamManager,
      service: this.service,
      host: `${this.config.host}:${this.config.port}`,
    });
    registerDanmakuRoutes(app, this.danmakuManager);
    registerSyncRoutes(app, this.syncDataManager);
    registerCookieRoutes(app, this.syncDataManager);
    registerAccountRoutes(app, this.service, this.syncDataManager);

    // 封面图片静态文件服务：/api/v1/stream/covers/:filename
    registerCoverRoute(app, this.config.coverDir);

    // 头像图片静态文件服务：/api/v1/stream/avatars/:filename
    registerAvatarRoute(app, this.config.avatarDir);

    // HLS 静态文件服务：/api/v1/stream/hls/<sessionId>/<path>
    registerHlsRoute(app, this.streamManager);

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

    // 确保头像图片目录存在（演示模式截帧用）
    try {
      await fs.promises.mkdir(this.config.avatarDir, { recursive: true });
    } catch {
      // ignore
    }

    // 初始化同步数据（从 SQLite 加载到内存）
    try {
      this.syncDataManager.init();
      // 注入到 LiveSiteService，使 QR 登录成功后能写入 cookie
      this.service.setSyncDataManager(this.syncDataManager);
    } catch (err) {
      console.error('加载同步数据失败:', err);
    }

    // 加载本地视频数据（local 平台）
    try {
      await this.service.loadLocalData();
    } catch (err) {
      console.error('加载本地视频数据失败:', err);
    }

    // 演示模式：预启动所有本地视频直播流，使点播即时播放。
    // 必须在 loadLocalData（房间列表就绪）之后、HTTP 服务监听之前完成，
    // 确保客户端首次请求即可命中已就绪的 HLS 会话。
    if (this.config.demoMode) {
      try {
        console.log('演示模式：正在预启动本地视频直播流...');
        await this.service.preWarmLocalStreams(this.streamManager);
      } catch (err) {
        console.error('预启动直播流失败（非致命）:', err);
      }
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
