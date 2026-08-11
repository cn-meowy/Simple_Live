/**
 * HLS 静态文件路由测试
 *
 * 覆盖 sessionId 含非 ASCII 字符（如中文文件名）时的 m3u8/ts 文件访问，
 * 回归保护 app.ts 旧实现用 req.url + indexOf 截取相对路径导致的 404。
 */

import { describe, it, before, after } from 'node:test';
// @ts-ignore
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import Fastify from 'fastify';
import { registerHlsRoute } from '../src/router/stream-routes.js';
import { FfmpegStreamManager } from '../src/service/ffmpeg-stream-manager.js';

// @ts-ignore
const TEST_STREAM_DIR = path.join(import.meta.dirname, 'test_hls_stream');

/**
 * 构造一个已注册会话的 streamManager（不启动 ffmpeg）。
 *
 * registerHlsRoute 仅依赖 getStreamPath，后者依据内部 _sessions 映射返回
 * path.join(streamDir, sessionId)。这里通过 getOrCreateLocalStream 之外的
 * 方式注入会话不可行（私有字段），因此用最小桩对象实现 getStreamPath 契约，
 * 专注于测试路由本身的相对路径解析逻辑。
 *
 * segmentCount 用于演示模式本地流取余兜底：>0 时请求不存在的 ts 分片序号会
 * 按 序号 % segmentCount 映射到首轮分片。
 */
function makeStreamManagerWithSession(
  streamDir: string,
  sessionId: string,
  segmentCount: number = 0,
): {
  getStreamPath: (id: string) => string | null;
  getSegmentCount: (id: string) => number;
} {
  return {
    getStreamPath(id: string): string | null {
      return id === sessionId ? path.join(streamDir, sessionId) : null;
    },
    getSegmentCount(id: string): number {
      return id === sessionId ? segmentCount : 0;
    },
  };
}

describe('HLS 静态文件路由', () => {
  let app: ReturnType<typeof Fastify> | null = null;

  before(async () => {
    await fs.mkdir(TEST_STREAM_DIR, { recursive: true });
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    await fs.rm(TEST_STREAM_DIR, { recursive: true, force: true });
  });

  it('sessionId 含中文时应正确返回 play.m3u8（非 404）', async () => {
    const sessionId = 'local_正片_1785764050933';
    const sessionDir = path.join(TEST_STREAM_DIR, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    const m3u8Content = '#EXTM3U\n#EXT-X-TARGETDURATION:2\n';
    await fs.writeFile(path.join(sessionDir, 'play.m3u8'), m3u8Content);

    app = Fastify();
    const streamManager = makeStreamManagerWithSession(TEST_STREAM_DIR, sessionId);
    registerHlsRoute(app, streamManager as unknown as FfmpegStreamManager);
    await app.listen({ port: 0 });

    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const encoded = encodeURIComponent(sessionId);
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/stream/hls/${encoded}/play.m3u8`,
    );

    assert.equal(res.status, 200, '含中文 sessionId 的 m3u8 请求应返回 200');
    assert.equal(res.headers.get('content-type'), 'application/vnd.apple.mpegurl');
    const body = await res.text();
    assert.equal(body, m3u8Content, '应返回 m3u8 文件内容');

    await app.close();
    app = null;
  });

  it('sessionId 含中文时应正确返回 ts 分片', async () => {
    const sessionId = 'local_测试视频_1785764050999';
    const sessionDir = path.join(TEST_STREAM_DIR, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    const tsContent = Buffer.from('fake-ts-segment-data');
    await fs.writeFile(path.join(sessionDir, 'seg_000.ts'), tsContent);

    app = Fastify();
    const streamManager = makeStreamManagerWithSession(TEST_STREAM_DIR, sessionId);
    registerHlsRoute(app, streamManager as unknown as FfmpegStreamManager);
    await app.listen({ port: 0 });

    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const encoded = encodeURIComponent(sessionId);
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/stream/hls/${encoded}/seg_000.ts`,
    );

    assert.equal(res.status, 200, '含中文 sessionId 的 ts 请求应返回 200');
    assert.equal(res.headers.get('content-type'), 'video/mp2t');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(buf, tsContent, '应返回 ts 分片内容');

    await app.close();
    app = null;
  });

  it('ASCII sessionId 应正常返回 m3u8（回归保护）', async () => {
    const sessionId = 'local_video1_1785764050000';
    const sessionDir = path.join(TEST_STREAM_DIR, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    const m3u8Content = '#EXTM3U\n';
    await fs.writeFile(path.join(sessionDir, 'play.m3u8'), m3u8Content);

    app = Fastify();
    const streamManager = makeStreamManagerWithSession(TEST_STREAM_DIR, sessionId);
    registerHlsRoute(app, streamManager as unknown as FfmpegStreamManager);
    await app.listen({ port: 0 });

    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/stream/hls/${sessionId}/play.m3u8`,
    );

    assert.equal(res.status, 200, 'ASCII sessionId 的 m3u8 请求应返回 200');
    assert.equal(await res.text(), m3u8Content);

    await app.close();
    app = null;
  });

  it('会话不存在时应返回 503 + Retry-After（引导播放器重试，非 404 放弃）', async () => {
    app = Fastify();
    const streamManager = makeStreamManagerWithSession(TEST_STREAM_DIR, 'local_exist_1');
    registerHlsRoute(app, streamManager as unknown as FfmpegStreamManager);
    await app.listen({ port: 0 });

    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/stream/hls/local_notexist_1/play.m3u8`,
    );

    // 会话不存在（可能正在重启）→ 503 引导重试，避免演示模式重启期间永久 404
    assert.equal(res.status, 503, '不存在的会话应返回 503 引导重试');
    assert.equal(res.headers.get('retry-after'), '1', '应携带 Retry-After 头');

    await app.close();
    app = null;
  });

  it('会话存在但 m3u8 文件缺失（重启窗口）应返回 503 + Retry-After', async () => {
    const sessionId = 'local_restarting_1785764060000';
    const sessionDir = path.join(TEST_STREAM_DIR, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    // 故意不创建 play.m3u8，模拟 ffmpeg 重启期间文件尚未生成

    app = Fastify();
    const streamManager = makeStreamManagerWithSession(TEST_STREAM_DIR, sessionId);
    registerHlsRoute(app, streamManager as unknown as FfmpegStreamManager);
    await app.listen({ port: 0 });

    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/stream/hls/${sessionId}/play.m3u8`,
    );

    assert.equal(res.status, 503, 'm3u8 缺失（重启窗口）应返回 503 引导重试');
    assert.equal(res.headers.get('retry-after'), '1', '应携带 Retry-After 头');

    await app.close();
    app = null;
  });

  it('会话存在但 ts 分片缺失应保持 404（delete_segments 正常淘汰）', async () => {
    const sessionId = 'local_seg_gone_1785764060001';
    const sessionDir = path.join(TEST_STREAM_DIR, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    app = Fastify();
    const streamManager = makeStreamManagerWithSession(TEST_STREAM_DIR, sessionId);
    registerHlsRoute(app, streamManager as unknown as FfmpegStreamManager);
    await app.listen({ port: 0 });

    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/stream/hls/${sessionId}/seg_999.ts`,
    );

    // ts 分片缺失多为 delete_segments 正常淘汰旧分片，保持 404 不触发无谓重试
    assert.equal(res.status, 404, '缺失的 ts 分片应保持 404');

    await app.close();
    app = null;
  });

  it('演示模式取余兜底：请求超窗口序号应映射到首轮分片（5%3=2）', async () => {
    const sessionId = 'local_loop_1785764060002';
    const sessionDir = path.join(TEST_STREAM_DIR, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    // 首轮 3 个分片存在
    const seg2Content = Buffer.from('seg2-content');
    await fs.writeFile(path.join(sessionDir, 'seg_000.ts'), Buffer.from('seg0'));
    await fs.writeFile(path.join(sessionDir, 'seg_001.ts'), Buffer.from('seg1'));
    await fs.writeFile(path.join(sessionDir, 'seg_002.ts'), seg2Content);

    app = Fastify();
    // segmentCount=3 启用取余兜底
    const streamManager = makeStreamManagerWithSession(TEST_STREAM_DIR, sessionId, 3);
    registerHlsRoute(app, streamManager as unknown as FfmpegStreamManager);
    await app.listen({ port: 0 });

    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    // 请求 seg_005.ts（不存在），5%3=2 → 应返回 seg_002.ts 内容
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/stream/hls/${sessionId}/seg_005.ts`,
    );

    assert.equal(res.status, 200, '超窗口序号取余后应命中首轮分片返回 200');
    assert.equal(res.headers.get('content-type'), 'video/mp2t');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(buf, seg2Content, '应返回 seg_002.ts 的内容');

    await app.close();
    app = null;
  });

  it('取余兜底未启用（segmentCount=0）时保持 404', async () => {
    const sessionId = 'local_nomod_1785764060003';
    const sessionDir = path.join(TEST_STREAM_DIR, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(path.join(sessionDir, 'seg_000.ts'), Buffer.from('seg0'));

    app = Fastify();
    // segmentCount=0 不启用取余
    const streamManager = makeStreamManagerWithSession(TEST_STREAM_DIR, sessionId);
    registerHlsRoute(app, streamManager as unknown as FfmpegStreamManager);
    await app.listen({ port: 0 });

    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/stream/hls/${sessionId}/seg_005.ts`,
    );

    assert.equal(res.status, 404, '未启用取余时缺失分片应保持 404');

    await app.close();
    app = null;
  });

  it('取余映射后仍不存在应保持 404', async () => {
    const sessionId = 'local_empty_1785764060004';
    const sessionDir = path.join(TEST_STREAM_DIR, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    // 故意不创建任何分片文件

    app = Fastify();
    const streamManager = makeStreamManagerWithSession(TEST_STREAM_DIR, sessionId, 3);
    registerHlsRoute(app, streamManager as unknown as FfmpegStreamManager);
    await app.listen({ port: 0 });

    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/stream/hls/${sessionId}/seg_005.ts`,
    );

    assert.equal(res.status, 404, '取余后映射的分片仍不存在应保持 404');

    await app.close();
    app = null;
  });
});
