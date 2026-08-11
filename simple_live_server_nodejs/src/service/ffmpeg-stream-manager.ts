/**
 * ffmpeg 进程池管理器
 *
 * 对应 Dart 版 simple_live_server/lib/service/ffmpeg_stream_manager.dart
 *
 * 管理活跃的 ffmpeg 转封装进程，支持引用计数、空闲超时关闭、并发限制。
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { CoreLog } from '../core/index.js';

/**
 * 流会话超过最大限制异常
 */
export class StreamSessionLimitException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamSessionLimitException';
  }
}

/**
 * 流会话创建结果
 */
export interface StreamSession {
  sessionId: string;
  hlsPath: string;
  hlsUrl: string;
}

/**
 * 内部流会话状态
 */
interface InternalStreamSession {
  sessionId: string;
  siteId: string;
  roomId: string;
  flvUrl: string;
  hlsPath: string;
  hlsUrl: string;
  process: ChildProcess;
  refCount: number;
  idleTimer: NodeJS.Timeout | null;
  /** 持久会话：不参与空闲超时回收，常驻至 dispose（演示模式预启动用） */
  persistent: boolean;
  /** ffmpeg 异常退出后的累计重启次数，达到 MAX_RESTARTS 后真正清理 */
  restartCount: number;
  /** stderr 环形缓冲，仅保留末尾用于诊断退出原因，上限 STDERR_BUF_SIZE */
  stderrBuf: string;
  /** 是否为本地文件模式（决定重启时调用 _startLocalFfmpegProcess） */
  isLocal: boolean;
  /** 重启期间的防抖标记，避免 exit 事件与重启逻辑竞争重复拉起 */
  restarting: boolean;
  /**
   * 一轮循环的分片数（取余兜底的模 N）。
   * 仅本地视频流启用：ffprobe 预算 N=ceil(时长/hls_time)。
   * 0 表示未启用（真实直播流 / ffprobe 失败），HLS 路由不触发取余。
   */
  segmentCount: number;
}

/**
 * ffmpeg 进程池管理器
 *
 * 管理活跃的 ffmpeg 转封装进程，支持引用计数、空闲超时关闭、并发限制。
 */
export class FfmpegStreamManager {
  readonly streamDir: string;
  readonly maxSessions: number;
  readonly idleTimeoutSeconds: number;
  readonly ffmpegPath: string;
  /** 等待 ffmpeg 写出 play.m3u8 的最长时间（毫秒） */
  readonly hlsReadyTimeoutMs: number;

  /** ffmpeg 异常退出后允许的最大重启次数，超过则真正清理会话 */
  static readonly MAX_RESTARTS = 3;
  /** stderr 诊断缓冲上限（字节），避免 ffmpeg 持续进度输出导致内存增长 */
  static readonly STDERR_BUF_SIZE = 8192;
  /** 重启前的基础退避毫秒数，按 restartCount 指数增长 */
  static readonly RESTART_BACKOFF_MS = 500;

  private readonly _sessions = new Map<string, InternalStreamSession>();
  private readonly _roomIndex = new Map<string, string>(); // siteId:roomId -> sessionId

  constructor(options: {
    streamDir: string;
    maxSessions?: number;
    idleTimeoutSeconds?: number;
    ffmpegPath?: string;
    hlsReadyTimeoutMs?: number;
  }) {
    this.streamDir = options.streamDir;
    this.maxSessions = options.maxSessions ?? 20;
    this.idleTimeoutSeconds = options.idleTimeoutSeconds ?? 30;
    this.ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
    this.hlsReadyTimeoutMs = options.hlsReadyTimeoutMs ?? 15000;
  }

  get activeSessionCount(): number {
    return this._sessions.size;
  }

  /**
   * 获取或创建流会话
   *
   * 同一房间复用同一进程，引用计数 +1。
   * 超过最大会话数时抛出 StreamSessionLimitException。
   */
  async getOrCreateStream(
    siteId: string,
    roomId: string,
    flvUrl: string,
  ): Promise<StreamSession> {
    const roomKey = `${siteId}:${roomId}`;

    // 检查是否已有会话
    const existingSessionId = this._roomIndex.get(roomKey);
    if (existingSessionId) {
      const session = this._sessions.get(existingSessionId);
      if (session) {
        session.refCount++;
        if (session.idleTimer) {
          clearTimeout(session.idleTimer);
          session.idleTimer = null;
        }
        return {
          sessionId: session.sessionId,
          hlsPath: session.hlsPath,
          hlsUrl: session.hlsUrl,
        };
      }
    }

    // 检查并发限制
    if (this._sessions.size >= this.maxSessions) {
      throw new StreamSessionLimitException(
        `已达到最大并发转封装会话数: ${this.maxSessions}`,
      );
    }

    // 创建新会话
    const sessionId = this._generateSessionId(siteId, roomId);
    const sessionDir = path.join(this.streamDir, sessionId);
    const hlsPath = path.join(sessionDir, 'play.m3u8');
    const hlsUrl = `/api/v1/stream/hls/${sessionId}/play.m3u8`;

    // 创建输出目录
    await fs.mkdir(sessionDir, { recursive: true });

    // 启动 ffmpeg 进程
    const process = this._startFfmpegProcess(flvUrl, sessionDir);

    const session: InternalStreamSession = {
      sessionId,
      siteId,
      roomId,
      flvUrl,
      hlsPath,
      hlsUrl,
      process,
      refCount: 1,
      idleTimer: null,
      persistent: false,
      restartCount: 0,
      stderrBuf: '',
      isLocal: false,
      restarting: false,
      segmentCount: 0,
    };

    this._sessions.set(sessionId, session);
    this._roomIndex.set(roomKey, sessionId);
    this._monitorProcess(session);

    // 等待 ffmpeg 写出 play.m3u8，避免客户端首次请求时文件尚未生成而 404
    await this._waitForHlsReady(session);

    return { sessionId, hlsPath, hlsUrl };
  }

  /**
   * 释放流会话引用，计数归零后启动延迟关闭定时器
   *
   * 持久会话（预启动）不参与空闲回收，常驻至 dispose。
   */
  releaseStream(sessionId: string): void {
    const session = this._sessions.get(sessionId);
    if (!session) return;

    session.refCount--;
    if (session.refCount <= 0) {
      // 持久会话不回收，常驻至 dispose
      if (session.persistent) return;

      if (session.idleTimer) {
        clearTimeout(session.idleTimer);
      }
      session.idleTimer = setTimeout(
        () => {
          this._cleanupSession(sessionId).catch(() => {});
        },
        this.idleTimeoutSeconds * 1000,
      );
    }
  }

  /**
   * 为本地视频文件创建 HLS 直播流
   *
   * 与 getOrCreateStream 区别：
   * - 输入是本地文件路径而非 URL
   * - 使用 -re -stream_loop -1 实现按帧率读取 + 循环播放
   * - roomKey 用 siteId:roomId 或文件路径，复用同一会话
   */
  async getOrCreateLocalStream(
    filePath: string,
    siteId: string = 'local',
    roomId?: string,
  ): Promise<StreamSession> {
    const effectiveRoomId = roomId ?? this._filePathToId(filePath);
    const roomKey = `${siteId}:${effectiveRoomId}`;

    // 检查是否已有会话
    const existingSessionId = this._roomIndex.get(roomKey);
    if (existingSessionId) {
      const session = this._sessions.get(existingSessionId);
      if (session) {
        session.refCount++;
        if (session.idleTimer) {
          clearTimeout(session.idleTimer);
          session.idleTimer = null;
        }
        return {
          sessionId: session.sessionId,
          hlsPath: session.hlsPath,
          hlsUrl: session.hlsUrl,
        };
      }
    }

    // 检查并发限制
    if (this._sessions.size >= this.maxSessions) {
      throw new StreamSessionLimitException(
        `已达到最大并发转封装会话数: ${this.maxSessions}`,
      );
    }

    // 创建新会话
    const sessionId = this._generateSessionId(siteId, effectiveRoomId);
    const sessionDir = path.join(this.streamDir, sessionId);
    const hlsPath = path.join(sessionDir, 'play.m3u8');
    const hlsUrl = `/api/v1/stream/hls/${sessionId}/play.m3u8`;

    // 创建输出目录
    await fs.mkdir(sessionDir, { recursive: true });

    // 探测时长预算一轮分片数 N（取余兜底用）；ffprobe 失败回退 0
    const segmentCount = await this._computeSegmentCount(filePath);

    // 启动 ffmpeg 进程（本地文件模式）
    // list_size 取 N（一轮分片数）使 m3u8 窗口恰好覆盖一轮；N=0 回退 4
    const process = this._startLocalFfmpegProcess(filePath, sessionDir, segmentCount > 0 ? segmentCount : 4);

    const session: InternalStreamSession = {
      sessionId,
      siteId,
      roomId: effectiveRoomId,
      flvUrl: filePath,
      hlsPath,
      hlsUrl,
      process,
      refCount: 1,
      idleTimer: null,
      persistent: false,
      restartCount: 0,
      stderrBuf: '',
      isLocal: true,
      restarting: false,
      segmentCount,
    };

    this._sessions.set(sessionId, session);
    this._roomIndex.set(roomKey, sessionId);
    this._monitorProcess(session);

    // 等待 ffmpeg 写出 play.m3u8，避免客户端首次请求时文件尚未生成而 404
    await this._waitForHlsReady(session);

    return { sessionId, hlsPath, hlsUrl };
  }

  /**
   * 预启动本地视频直播流（演示模式启动时调用）
   *
   * 与 getOrCreateLocalStream 区别：
   * - 创建持久会话（persistent=true），不参与空闲超时回收
   * - refCount 初始为 0，但不会触发空闲定时器
   * - 后续 getOrCreateLocalStream 命中同一 roomKey 时复用此会话，实现即时播放
   *
   * @throws ffmpeg 启动失败或 HLS 就绪超时时抛出，调用方应捕获并跳过
   */
  async preWarmLocalStream(
    filePath: string,
    siteId: string = 'local',
    roomId?: string,
  ): Promise<StreamSession> {
    const effectiveRoomId = roomId ?? this._filePathToId(filePath);
    const roomKey = `${siteId}:${effectiveRoomId}`;

    // 已有会话则复用（避免重复预启动）
    const existingSessionId = this._roomIndex.get(roomKey);
    if (existingSessionId) {
      const session = this._sessions.get(existingSessionId);
      if (session) {
        return {
          sessionId: session.sessionId,
          hlsPath: session.hlsPath,
          hlsUrl: session.hlsUrl,
        };
      }
    }

    // 检查并发限制
    if (this._sessions.size >= this.maxSessions) {
      throw new StreamSessionLimitException(
        `已达到最大并发转封装会话数: ${this.maxSessions}`,
      );
    }

    // 创建新会话
    const sessionId = this._generateSessionId(siteId, effectiveRoomId);
    const sessionDir = path.join(this.streamDir, sessionId);
    const hlsPath = path.join(sessionDir, 'play.m3u8');
    const hlsUrl = `/api/v1/stream/hls/${sessionId}/play.m3u8`;

    // 创建输出目录
    await fs.mkdir(sessionDir, { recursive: true });

    // 探测时长预算一轮分片数 N（取余兜底用）；ffprobe 失败回退 0
    const segmentCount = await this._computeSegmentCount(filePath);

    // 启动 ffmpeg 进程（本地文件模式）
    // list_size 取 N（一轮分片数）使 m3u8 窗口恰好覆盖一轮；N=0 回退 4
    const process = this._startLocalFfmpegProcess(filePath, sessionDir, segmentCount > 0 ? segmentCount : 4);

    const session: InternalStreamSession = {
      sessionId,
      siteId,
      roomId: effectiveRoomId,
      flvUrl: filePath,
      hlsPath,
      hlsUrl,
      process,
      refCount: 0,
      idleTimer: null,
      persistent: true,
      restartCount: 0,
      stderrBuf: '',
      isLocal: true,
      restarting: false,
      segmentCount,
    };

    this._sessions.set(sessionId, session);
    this._roomIndex.set(roomKey, sessionId);
    this._monitorProcess(session);

    // 等待 ffmpeg 写出 play.m3u8，避免客户端首次请求时文件尚未生成而 404
    await this._waitForHlsReady(session);

    return { sessionId, hlsPath, hlsUrl };
  }

  /**
   * 获取指定会话的静态文件目录路径，不存在返回 null
   */
  getStreamPath(sessionId: string): string | null {
    const session = this._sessions.get(sessionId);
    return session ? path.join(this.streamDir, sessionId) : null;
  }

  /**
   * 获取指定会话一轮循环的分片数（取余兜底的模 N）
   *
   * 仅本地视频流（演示模式）启用：ffprobe 探测时长后预算 N=ceil(时长/hls_time)。
   * 返回 0 表示未启用（真实直播 FLV 流、ffprobe 失败的本地流），
   * HLS 路由据此决定是否对超窗口 ts 序号做取余映射。
   */
  getSegmentCount(sessionId: string): number {
    const session = this._sessions.get(sessionId);
    return session ? session.segmentCount : 0;
  }

  /**
   * 获取指定会话当前 ffmpeg 进程的 PID，会话不存在或进程已退出返回 null
   *
   * 用于运维诊断与测试（判断会话是否存活、是否已重启换进程）。
   */
  getProcessPid(sessionId: string): number | null {
    const session = this._sessions.get(sessionId);
    if (!session) return null;
    // 进程已退出时 exitCode/signalCode 非 null
    if (session.process.exitCode !== null || session.process.signalCode !== null) {
      return null;
    }
    return session.process.pid ?? null;
  }

  /**
   * 释放所有资源
   */
  async dispose(): Promise<void> {
    const ids = Array.from(this._sessions.keys());
    for (const id of ids) {
      await this._cleanupSession(id);
    }
  }

  // ====== 私有方法 ======

  /**
   * 等待 ffmpeg 写出 play.m3u8 文件
   *
   * 解决竞态：getOrCreate* 在 spawn ffmpeg 后立即返回 URL，但首个 m3u8 分片
   * 需要数秒才能生成，客户端在此期间请求会 404。这里用条件轮询等待文件出现，
   * 而非硬编码 sleep——文件就绪即返回，既不浪费时间也不丢精度。
   *
   * - 进程提前退出 / 报错 → 立即抛出，避免返回永远 404 的空会话
   * - 超过 hlsReadyTimeoutMs 仍无文件 → 抛出超时错误
   */
  private async _waitForHlsReady(session: InternalStreamSession): Promise<void> {
    const { hlsPath, process } = session;
    const deadline = Date.now() + this.hlsReadyTimeoutMs;
    const intervalMs = 100;

    while (Date.now() < deadline) {
      // 文件已生成 → 就绪
      if (existsSync(hlsPath)) {
        return;
      }

      // 进程已退出 → ffmpeg 启动失败，抛错而非返回空会话
      if (process.exitCode !== null || process.signalCode !== null) {
        throw new Error(
          `ffmpeg 进程提前退出，未能生成 HLS：sessionId=${session.sessionId}` +
            ` exitCode=${process.exitCode} signal=${process.signalCode}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `等待 HLS 就绪超时（${this.hlsReadyTimeoutMs}ms）：sessionId=${session.sessionId}`,
    );
  }

  private _startFfmpegProcess(flvUrl: string, outputDir: string): ChildProcess {
    return spawn(this.ffmpegPath, [
      '-i', flvUrl,
      '-c', 'copy',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '4',
      '-hls_flags', 'delete_segments',
      '-hls_segment_filename', path.join(outputDir, 'seg_%03d.ts'),
      path.join(outputDir, 'play.m3u8'),
    ], {
      // stdout 对 HLS 转封装无意义，直接 ignore；保留 stderr 用于诊断退出原因
      // （在 _monitorProcess 中消费，避免 Linux pipe 缓冲区写满导致 ffmpeg 阻塞/EPIPE 退出）
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  }

  /**
   * 启动本地文件转 HLS 的 ffmpeg 进程
   *
   * 与 _startFfmpegProcess 区别：
   * - 加 -re 按真实帧率读取文件
   * - 加 -stream_loop -1 实现无限循环播放
   */
  /**
   * 启动本地文件转 HLS 的 ffmpeg 进程
   *
   * 与 _startFfmpegProcess 区别：
   * - 加 -re 按真实帧率读取文件
   * - 加 -stream_loop -1 实现无限循环播放
   * - 不加 delete_segments：分片文件保留不删，配合取余兜底实现循环播放
   *   （-stream_loop 循环输入时序号单调递增不回绕，删除旧分片会导致超窗口
   *   请求 404；保留分片后，HLS 路由对超窗口序号按 segmentCount 取余映射到首轮）
   * - hls_list_size 由调用方按视频时长预算传入（一轮分片数 N），使 m3u8 窗口
   *   恰好覆盖一轮；ffprobe 失败时回退 4
   */
  private _startLocalFfmpegProcess(filePath: string, outputDir: string, listSize: number): ChildProcess {
    return spawn(this.ffmpegPath, [
      '-re',
      '-stream_loop', '-1',
      '-i', filePath,
      '-c', 'copy',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', String(listSize),
      '-hls_segment_filename', path.join(outputDir, 'seg_%03d.ts'),
      path.join(outputDir, 'play.m3u8'),
    ], {
      // stdout 无意义 ignore；stderr 保留供诊断（见 _startFfmpegProcess 说明）
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  }

  /**
   * 将文件路径转为合法的 roomId（取文件名去扩展名）
   */
  private _filePathToId(filePath: string): string {
    const base = path.basename(filePath);
    const ext = path.extname(base);
    return base.slice(0, base.length - ext.length);
  }

  /**
   * 用 ffprobe 探测视频时长（秒），失败返回 0
   *
   * ffprobe 路径由 ffmpegPath 推导（同目录）；超时 5 秒避免卡住启动流程。
   * 不抛错：失败时 segmentCount 回退 0，HLS 路由不启用取余兜底，
   * list_size 回退默认值。
   */
  private async _probeDuration(filePath: string): Promise<number> {
    // 由 ffmpegPath 推导 ffprobe 路径：同目录下的 ffprobe
    const ffmpegDir = path.dirname(this.ffmpegPath);
    const ffprobePath = ffmpegDir === '.' || ffmpegDir === ''
      ? 'ffprobe'
      : path.join(ffmpegDir, 'ffprobe');

    return new Promise<number>((resolve) => {
      const proc = spawn(ffprobePath, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath,
      ], { stdio: ['ignore', 'pipe', 'ignore'] });

      let stdout = '';
      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });

      // 超时保护：5 秒未返回则 kill，避免阻塞启动
      const timer = setTimeout(() => {
        proc.kill();
        resolve(0);
      }, 5000);

      proc.on('exit', () => {
        clearTimeout(timer);
      });

      proc.on('error', () => {
        clearTimeout(timer);
        resolve(0);
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          resolve(0);
          return;
        }
        const duration = parseFloat(stdout.trim());
        resolve(Number.isFinite(duration) && duration > 0 ? duration : 0);
      });
    });
  }

  /**
   * 由视频时长预算一轮循环分片数 N=ceil(时长/hls_time)
   *
   * hls_time 固定 2 秒。时长为 0（ffprobe 失败）时返回 0 表示未启用。
   */
  private async _computeSegmentCount(filePath: string): Promise<number> {
    const duration = await this._probeDuration(filePath);
    if (duration <= 0) return 0;
    return Math.max(1, Math.ceil(duration / 2));
  }

  private _monitorProcess(session: InternalStreamSession): void {
    // 消费 stderr：既防止 Linux 下未消费 pipe 缓冲区写满导致 ffmpeg 阻塞/EPIPE 退出，
    // 又将末尾输出留作退出诊断。用环形截断保证缓冲不无限增长。
    session.process.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      const combined = session.stderrBuf + text;
      session.stderrBuf = combined.length > FfmpegStreamManager.STDERR_BUF_SIZE
        ? combined.slice(combined.length - FfmpegStreamManager.STDERR_BUF_SIZE)
        : combined;
    });

    session.process.on('exit', (exitCode, signal) => {
      // 正在重启（_restartSession 主动 kill 旧进程）时忽略本次 exit，避免误判
      if (session.restarting) return;

      // 会话已被 _cleanupSession/dispose 主动移除 → 视为正常退出，不重启
      if (!this._sessions.has(session.sessionId)) {
        CoreLog.info(
          `ffmpeg 进程退出（会话已清理）: sessionId=${session.sessionId}, exitCode=${exitCode}, signal=${signal}`,
        );
        return;
      }

      const stderrTail = session.stderrBuf.length > 0
        ? ` stderr末尾=${session.stderrBuf.replace(/\s+/g, ' ').trim().slice(-512)}`
        : '';

      // 非正常退出（非 0 且非被 sigterm/sigkill 主动终止）
      // 注意：部分平台 ffmpeg 收到 SIGTERM 后以 exitCode=255、signal=null 退出，
      // 此处依赖"会话是否仍在 _sessions"区分主动清理与真正异常退出。
      const code = exitCode ?? -1;
      if (code !== 0 && code !== -15 && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
        CoreLog.warn(
          `ffmpeg 进程异常退出，尝试重启: sessionId=${session.sessionId}, exitCode=${exitCode}, signal=${signal},${stderrTail}`,
        );
        this._restartSession(session).catch((err) => {
          CoreLog.error(
            `ffmpeg 重启失败，清理会话: sessionId=${session.sessionId}, ${err instanceof Error ? err.message : String(err)}`,
          );
          this._cleanupSession(session.sessionId).catch(() => {});
        });
      } else {
        CoreLog.info(
          `ffmpeg 进程退出: sessionId=${session.sessionId}, exitCode=${exitCode}, signal=${signal}`,
        );
      }
    });

    session.process.on('error', (err) => {
      CoreLog.error(`ffmpeg 进程错误: sessionId=${session.sessionId}, ${err.message}`);
      // spawn 失败（如 ffmpeg 不存在）不重试，直接清理
      this._cleanupSession(session.sessionId).catch(() => {});
    });
  }

  /**
   * 重启异常退出的 ffmpeg 会话
   *
   * 关键设计：
   * - 复用原 sessionId 和 sessionDir，保证客户端持有的 URL 不失效
   * - 清空 stderrBuf，新一轮收集
   * - 设置 restarting 标志覆盖整个重启生命周期（spawn→就绪），
   *   期间新进程的 exit 事件被忽略，避免与重启逻辑竞争重复拉起/清理
   * - _waitForHlsReady 失败（新进程又异常退出）时在内部递归重试，
   *   达 MAX_RESTARTS 后真正清理，避免对损坏输入形成重启风暴
   *
   * 注意：本方法可能在 exit 事件回调中通过 .catch 触发，
   * 内部所有异步步骤均被捕获，不会抛出未处理 rejection。
   */
  private async _restartSession(session: InternalStreamSession): Promise<void> {
    // 会话已被清理（dispose 等）则放弃重启
    if (!this._sessions.has(session.sessionId)) return;
    // 已有重启在进行中（并发触发），由进行中的那次负责后续重试
    if (session.restarting) return;

    // 超过最大重启次数：真正清理
    if (session.restartCount >= FfmpegStreamManager.MAX_RESTARTS) {
      CoreLog.warn(
        `ffmpeg 重启次数已达上限(${FfmpegStreamManager.MAX_RESTARTS})，清理会话: sessionId=${session.sessionId}`,
      );
      await this._cleanupSession(session.sessionId);
      return;
    }

    session.restartCount++;
    const backoff = FfmpegStreamManager.RESTART_BACKOFF_MS * Math.pow(2, session.restartCount - 1);
    CoreLog.info(
      `重启 ffmpeg 会话: sessionId=${session.sessionId}, 第 ${session.restartCount}/${FfmpegStreamManager.MAX_RESTARTS} 次, 退避 ${backoff}ms`,
    );
    await new Promise((resolve) => setTimeout(resolve, backoff));

    // 会话可能在退避期间被清理
    if (!this._sessions.has(session.sessionId)) return;

    // 标记重启中：覆盖 spawn→就绪全过程，期间忽略新进程 exit 事件
    session.restarting = true;
    session.stderrBuf = '';
    const sessionDir = path.join(this.streamDir, session.sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    try {
      // 重新 spawn ffmpeg（按是否本地模式选择启动方式），复用原 sessionId/dir
      // 本地流复用原 segmentCount 作为 listSize（视频文件未变，无需重算）
      const newProcess = session.isLocal
        ? this._startLocalFfmpegProcess(session.flvUrl, sessionDir, session.segmentCount > 0 ? session.segmentCount : 4)
        : this._startFfmpegProcess(session.flvUrl, sessionDir);
      session.process = newProcess;

      // 重新挂载监控（监听新进程的 exit/stderr）
      this._monitorProcess(session);

      // 等待新 ffmpeg 写出 play.m3u8；失败（新进程又退出）则递归重试
      await this._waitForHlsReady(session);
    } catch (err) {
      CoreLog.warn(
        `ffmpeg 重启后仍未就绪: sessionId=${session.sessionId}, ${err instanceof Error ? err.message : String(err)}`,
      );
      // 若会话已被并发清理（dispose 等），终止可能残留的新进程避免孤儿进程
      if (!this._sessions.has(session.sessionId)) {
        this._killProcessSafely(session.process);
        return;
      }
      // 递归重试：restartCount 已自增，达到上限会在开头触发清理
      await this._restartSession(session);
    } finally {
      session.restarting = false;
    }
  }

  /**
   * 安全终止 ffmpeg 进程，忽略"进程已退出"等异常
   */
  private _killProcessSafely(proc: ChildProcess): void {
    try {
      if (proc.pid && proc.exitCode === null && proc.signalCode === null) {
        proc.kill('SIGTERM');
      }
    } catch {
      // 进程可能已退出，忽略
    }
  }

  private async _cleanupSession(sessionId: string): Promise<void> {
    const session = this._sessions.get(sessionId);
    if (!session) return;

    this._sessions.delete(sessionId);

    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
    }

    // 终止 ffmpeg 进程
    try {
      if (session.process.pid) {
        session.process.kill('SIGTERM');
      }
    } catch {
      // 进程可能已退出
    }

    const roomKey = `${session.siteId}:${session.roomId}`;
    if (this._roomIndex.get(roomKey) === sessionId) {
      this._roomIndex.delete(roomKey);
    }

    // 延迟删除目录
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const dir = path.join(this.streamDir, sessionId);
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  private _generateSessionId(siteId: string, roomId: string): string {
    const ts = Date.now();
    return `${siteId}_${roomId}_${ts}`;
  }
}
