/**
 * 服务端配置
 *
 * 对应 Dart 版 simple_live_server/lib/config/server_config.dart
 */

export class ServerConfig {
  /** 监听端口 */
  readonly port: number;

  /** 监听地址 */
  readonly host: string;

  /** B站 Cookie */
  readonly bilibiliCookie: string;

  /** 抖音 Cookie */
  readonly douyinCookie: string;

  /** 是否启用日志 */
  readonly enableLog: boolean;

  /** 弹幕最大并发连接数 */
  readonly maxDanmakuConnections: number;

  /** 最大并发转封装会话数 */
  readonly maxStreamSessions: number;

  /** HLS 分片临时目录 */
  readonly streamDir: string;

  /** 空闲进程关闭延迟（秒） */
  readonly streamIdleTimeout: number;

  /** 演示模式：只显示 local 平台（用于 Apple Store 审核） */
  readonly demoMode: boolean;

  /** 本地视频文件目录（local 平台数据源） */
  readonly localVideoDir: string;

  /** 本地数据 JSON 文件路径（为空则自动扫描目录） */
  readonly localDataFile: string;

  /** 封面图片存储目录（演示模式截取视频第一帧保存位置） */
  readonly coverDir: string;

  /** 同步数据 SQLite 数据库路径（为空则纯内存模式，不持久化） */
  readonly syncDbPath: string;

  constructor(options: {
    port?: number;
    host?: string;
    bilibiliCookie?: string;
    douyinCookie?: string;
    enableLog?: boolean;
    maxDanmakuConnections?: number;
    maxStreamSessions?: number;
    streamDir?: string;
    streamIdleTimeout?: number;
    demoMode?: boolean;
    localVideoDir?: string;
    localDataFile?: string;
    coverDir?: string;
    syncDbPath?: string;
  } = {}) {
    this.port = options.port ?? 8080;
    this.host = options.host ?? '0.0.0.0';
    this.bilibiliCookie = options.bilibiliCookie ?? '';
    this.douyinCookie = options.douyinCookie ?? '';
    this.enableLog = options.enableLog ?? true;
    this.maxDanmakuConnections = options.maxDanmakuConnections ?? 100;
    this.maxStreamSessions = options.maxStreamSessions ?? 20;
    this.streamDir = options.streamDir ?? '/tmp/live_stream';
    this.streamIdleTimeout = options.streamIdleTimeout ?? 30;
    this.demoMode = options.demoMode ?? false;
    this.localVideoDir = options.localVideoDir ?? '/data/videos';
    this.localDataFile = options.localDataFile ?? '';
    this.coverDir = options.coverDir ?? '/tmp/live_stream/covers';
    this.syncDbPath = options.syncDbPath ?? '';
  }

  /**
   * 从环境变量读取配置
   *
   * 对应 Dart 版 ServerConfig.fromEnv()
   */
  static fromEnv(): ServerConfig {
    const env = process.env;

    const parseIntSafe = (value: string | undefined, defaultValue: number): number => {
      if (value === undefined || value === '') return defaultValue;
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? defaultValue : parsed;
    };

    const parseBoolSafe = (value: string | undefined, defaultValue: boolean): boolean => {
      if (value === undefined || value === '') return defaultValue;
      return value.toLowerCase() === 'true';
    };

    return new ServerConfig({
      port: parseIntSafe(env.PORT, 8089),
      host: env.HOST ?? '0.0.0.0',
      bilibiliCookie: env.BILIBILI_COOKIE ?? '',
      douyinCookie: env.DOUYIN_COOKIE ?? '',
      enableLog: parseBoolSafe(env.ENABLE_LOG, true),
      maxDanmakuConnections: parseIntSafe(env.MAX_DANMAKU_CONNECTIONS, 100),
      maxStreamSessions: parseIntSafe(env.MAX_STREAM_SESSIONS, 20),
      streamDir: env.STREAM_DIR ?? '/tmp/live_stream',
      streamIdleTimeout: parseIntSafe(env.STREAM_IDLE_TIMEOUT, 30),
      demoMode: parseBoolSafe(env.DEMO_MODE, false),
      localVideoDir: env.LOCAL_VIDEO_DIR ?? '/data/videos',
      localDataFile: env.LOCAL_DATA_FILE ?? '',
      coverDir: env.COVER_DIR ?? '/tmp/live_stream/covers',
      syncDbPath: env.SYNC_DB_PATH ?? '/data/sync_data.db',
    });
  }
}
