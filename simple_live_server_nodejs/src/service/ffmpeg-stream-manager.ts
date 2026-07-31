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

  private readonly _sessions = new Map<string, InternalStreamSession>();
  private readonly _roomIndex = new Map<string, string>(); // siteId:roomId -> sessionId

  constructor(options: {
    streamDir: string;
    maxSessions?: number;
    idleTimeoutSeconds?: number;
    ffmpegPath?: string;
  }) {
    this.streamDir = options.streamDir;
    this.maxSessions = options.maxSessions ?? 20;
    this.idleTimeoutSeconds = options.idleTimeoutSeconds ?? 30;
    this.ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
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
    };

    this._sessions.set(sessionId, session);
    this._roomIndex.set(roomKey, sessionId);
    this._monitorProcess(session);

    return { sessionId, hlsPath, hlsUrl };
  }

  /**
   * 释放流会话引用，计数归零后启动延迟关闭定时器
   */
  releaseStream(sessionId: string): void {
    const session = this._sessions.get(sessionId);
    if (!session) return;

    session.refCount--;
    if (session.refCount <= 0) {
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

    // 启动 ffmpeg 进程（本地文件模式）
    const process = this._startLocalFfmpegProcess(filePath, sessionDir);

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
    };

    this._sessions.set(sessionId, session);
    this._roomIndex.set(roomKey, sessionId);
    this._monitorProcess(session);

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
   * 释放所有资源
   */
  async dispose(): Promise<void> {
    const ids = Array.from(this._sessions.keys());
    for (const id of ids) {
      await this._cleanupSession(id);
    }
  }

  // ====== 私有方法 ======

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
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  /**
   * 启动本地文件转 HLS 的 ffmpeg 进程
   *
   * 与 _startFfmpegProcess 区别：
   * - 加 -re 按真实帧率读取文件
   * - 加 -stream_loop -1 实现无限循环播放
   */
  private _startLocalFfmpegProcess(filePath: string, outputDir: string): ChildProcess {
    return spawn(this.ffmpegPath, [
      '-re',
      '-stream_loop', '-1',
      '-i', filePath,
      '-c', 'copy',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '4',
      '-hls_flags', 'delete_segments',
      '-hls_segment_filename', path.join(outputDir, 'seg_%03d.ts'),
      path.join(outputDir, 'play.m3u8'),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
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

  private _monitorProcess(session: InternalStreamSession): void {
    session.process.on('exit', (exitCode, signal) => {
      // 非正常退出（非 0 且非被 sigterm/sigkill）
      const code = exitCode ?? -1;
      if (code !== 0 && code !== -15 && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
        CoreLog.warn(
          `ffmpeg 进程异常退出: sessionId=${session.sessionId}, exitCode=${exitCode}, signal=${signal}`,
        );
        this._cleanupSession(session.sessionId).catch(() => {});
      } else {
        CoreLog.info(
          `ffmpeg 进程退出: sessionId=${session.sessionId}, exitCode=${exitCode}, signal=${signal}`,
        );
      }
    });

    session.process.on('error', (err) => {
      CoreLog.error(`ffmpeg 进程错误: sessionId=${session.sessionId}, ${err.message}`);
      this._cleanupSession(session.sessionId).catch(() => {});
    });
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
