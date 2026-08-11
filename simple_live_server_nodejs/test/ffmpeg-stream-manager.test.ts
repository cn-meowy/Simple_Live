/**
 * FfmpegStreamManager 竞态测试
 *
 * 验证 getOrCreateLocalStream 在返回前等待 ffmpeg 写出 play.m3u8，
 * 避免客户端首次请求 m3u8 时因文件尚未生成而 404。
 *
 * 需要系统安装 ffmpeg；若无 ffmpeg 则跳过。
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { FfmpegStreamManager } from '../src/service/ffmpeg-stream-manager.js';

const TEST_DIR = path.join(import.meta.dirname, 'test_ffmpeg_stream');
const SRC_VIDEO = path.join(TEST_DIR, 'src.mp4');

/**
 * 检测 ffmpeg 是否可用
 */
async function hasFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
  });
}

/**
 * 生成一个短测试视频（mp4）
 */
async function makeTestVideo(outPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-f', 'lavfi',
      '-i', 'testsrc=duration=6:size=160x120:rate=25',
      '-c:v', 'libx264',
      '-g', '25',
      '-f', 'mp4',
      '-y',
      outPath,
    ], { stdio: 'ignore' });
    proc.on('error', reject);
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg 生成测试视频失败 exit=${code}`))));
  });
}

describe('FfmpegStreamManager 竞态', () => {
  let ffmpegAvailable = false;

  before(async () => {
    ffmpegAvailable = await hasFfmpeg();
    if (!ffmpegAvailable) return;
    await fs.mkdir(TEST_DIR, { recursive: true });
    await makeTestVideo(SRC_VIDEO);
  });

  after(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('getOrCreateLocalStream 返回时 play.m3u8 应已存在（非首次 404）', async function () {
    if (!ffmpegAvailable) this.skip();

    const streamDir = path.join(TEST_DIR, 'streams');
    const manager = new FfmpegStreamManager({
      streamDir,
      maxSessions: 2,
      idleTimeoutSeconds: 5,
    });

    try {
      const session = await manager.getOrCreateLocalStream(SRC_VIDEO, 'local', 'race_test');

      // 核心断言：方法返回时 m3u8 文件必须已生成，否则客户端首次请求会 404
      assert.ok(
        existsSync(session.hlsPath),
        `getOrCreateLocalStream 返回后 play.m3u8 应已存在: ${session.hlsPath}`,
      );

      // m3u8 内容应是合法 HLS 播放列表
      const content = await fs.readFile(session.hlsPath, 'utf-8');
      assert.ok(content.includes('#EXTM3U'), 'play.m3u8 应为合法 HLS 播放列表');
    } finally {
      await manager.dispose();
    }
  });

  it('ffmpeg 启动失败时应抛出错误而非返回空会话', async function () {
    if (!ffmpegAvailable) this.skip();

    const streamDir = path.join(TEST_DIR, 'streams_err');
    const manager = new FfmpegStreamManager({
      streamDir,
      ffmpegPath: '/nonexistent/ffmpeg',
    });

    try {
      await assert.rejects(
        () => manager.getOrCreateLocalStream(SRC_VIDEO, 'local', 'err_test'),
        (err: Error) => {
          // ffmpeg 不存在应抛错，而非返回一个永远 404 的会话
          assert.ok(err.message.length > 0, '应有错误信息');
          return true;
        },
      );
    } finally {
      await manager.dispose();
    }
  });

  it('preWarmLocalStream 创建持久会话，releaseStream 后不被空闲超时回收', async function () {
    if (!ffmpegAvailable) this.skip();

    const streamDir = path.join(TEST_DIR, 'streams_prewarm');
    const manager = new FfmpegStreamManager({
      streamDir,
      maxSessions: 5,
      idleTimeoutSeconds: 1, // 极短超时，验证持久会话不被回收
    });

    try {
      const session = await manager.preWarmLocalStream(SRC_VIDEO, 'local', 'prewarm_test');

      // 核心断言1：返回时 m3u8 已就绪
      assert.ok(existsSync(session.hlsPath), '预启动返回时 play.m3u8 应已存在');

      // 核心断言2：会话存在（refCount 为 0 的持久会话）
      assert.equal(manager.activeSessionCount, 1);

      // 模拟客户端获取并释放：应复用持久会话
      const s2 = await manager.getOrCreateLocalStream(SRC_VIDEO, 'local', 'prewarm_test');
      assert.equal(s2.sessionId, session.sessionId, '应复用持久会话');
      manager.releaseStream(s2.sessionId);

      // 等待超过 idleTimeoutSeconds（1s），持久会话不应被回收
      await new Promise((r) => setTimeout(r, 1500));
      assert.equal(manager.activeSessionCount, 1, '持久会话不应被空闲超时回收');
      assert.ok(existsSync(session.hlsPath), '持久会话的 m3u8 应仍存在');
    } finally {
      await manager.dispose();
    }
  });

  it('preWarmLocalStream 失败时抛错且不残留空会话', async function () {
    if (!ffmpegAvailable) this.skip();

    const streamDir = path.join(TEST_DIR, 'streams_prewarm_err');
    const manager = new FfmpegStreamManager({
      streamDir,
      ffmpegPath: '/nonexistent/ffmpeg',
    });

    try {
      await assert.rejects(
        () => manager.preWarmLocalStream(SRC_VIDEO, 'local', 'prewarm_err'),
        (err: Error) => {
          assert.ok(err.message.length > 0);
          return true;
        },
      );
      assert.equal(manager.activeSessionCount, 0, '失败会话不应残留');
    } finally {
      await manager.dispose();
    }
  });
});

/**
 * 等待条件成立，轮询直到 predicate 返回 true 或超时
 */
async function waitFor<T>(
  predicate: () => T | undefined,
  timeoutMs: number,
  intervalMs = 100,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = predicate();
    if (result) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor 超时（${timeoutMs}ms）`);
}

describe('FfmpegStreamManager 异常退出自动重启', () => {
  let ffmpegAvailable = false;

  before(async () => {
    ffmpegAvailable = await hasFfmpeg();
    if (!ffmpegAvailable) return;
    await fs.mkdir(TEST_DIR, { recursive: true });
    await makeTestVideo(SRC_VIDEO);
  });

  after(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('ffmpeg 异常退出（SIGSEGV）后应自动重启，会话与 sessionId 保持不变', { timeout: 30000 }, async function () {
    if (!ffmpegAvailable) this.skip();

    const streamDir = path.join(TEST_DIR, 'streams_restart');
    const manager = new FfmpegStreamManager({
      streamDir,
      maxSessions: 5,
      idleTimeoutSeconds: 30,
      hlsReadyTimeoutMs: 15000,
    });

    try {
      const session = await manager.getOrCreateLocalStream(SRC_VIDEO, 'local', 'restart_test');
      const originalId = session.sessionId;
      const originalPid = manager.getProcessPid(originalId);
      assert.ok(originalPid, '应能获取运行中的 ffmpeg PID');

      // 模拟异常退出：SIGSEGV 不在 SIGTERM/SIGKILL 之列，触发重启分支
      try {
        process.kill(originalPid, 'SIGSEGV');
      } catch {
        // 进程可能已自行退出，忽略
      }

      // 等待新进程拉起（PID 变化）且 m3u8 重新生成
      await waitFor(
        () => {
          const newPid = manager.getProcessPid(originalId);
          if (!newPid || newPid === originalPid) return undefined;
          return existsSync(session.hlsPath) ? newPid : undefined;
        },
        25000,
      );

      // 核心断言：会话仍存在，sessionId 不变（客户端 URL 不失效）
      assert.equal(manager.activeSessionCount, 1, '重启后会话应仍存在');
      assert.equal(manager.getStreamPath(originalId), path.join(streamDir, originalId), 'sessionId 应保持不变');
      const newPid = manager.getProcessPid(originalId);
      assert.ok(newPid && newPid !== originalPid, '应已拉起新的 ffmpeg 进程');
    } finally {
      await manager.dispose();
    }
  });

  it('重启超过上限后应真正清理会话', { timeout: 60000 }, async function () {
    if (!ffmpegAvailable) this.skip();

    const streamDir = path.join(TEST_DIR, 'streams_maxrestart');
    const manager = new FfmpegStreamManager({
      streamDir,
      maxSessions: 5,
      idleTimeoutSeconds: 30,
      hlsReadyTimeoutMs: 15000,
    });

    try {
      const session = await manager.getOrCreateLocalStream(SRC_VIDEO, 'local', 'maxrestart_test');
      const sessionId = session.sessionId;

      // 连续触发 4 次异常退出（默认 MAX_RESTARTS=3，第 4 次应触发最终清理）
      for (let i = 0; i < 4; i++) {
        // 等待当前进程就绪可被 kill
        const pid = await waitFor(
          () => manager.getProcessPid(sessionId),
          20000,
        );
        try {
          process.kill(pid, 'SIGSEGV');
        } catch {
          // 忽略
        }
        // 短暂等待 exit 事件处理 + 重启或清理发生
        await new Promise((r) => setTimeout(r, 1500));
      }

      // 核心断言：超过重启上限后会话被清理
      await waitFor(
        () => (manager.activeSessionCount === 0 ? true : undefined),
        30000,
      );
      assert.equal(manager.activeSessionCount, 0, '超过重启上限后会话应被清理');
      assert.equal(manager.getStreamPath(sessionId), null, '清理后 getStreamPath 应返回 null');
    } finally {
      await manager.dispose();
    }
  });
});
