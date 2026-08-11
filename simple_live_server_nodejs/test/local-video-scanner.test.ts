/**
 * LocalVideoScanner 单元测试
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LocalVideoScanner } from '../src/service/local-video-scanner.js';

const TEST_DIR = path.join(import.meta.dirname, 'test_videos');
const TEST_DATA_FILE = path.join(import.meta.dirname, 'test_local_data.json');

describe('LocalVideoScanner', () => {
  before(async () => {
    // 创建测试目录结构
    await fs.mkdir(path.join(TEST_DIR, 'subdir'), { recursive: true });

    // 创建测试视频文件
    await fs.writeFile(path.join(TEST_DIR, 'video1.mp4'), 'fake');
    await fs.writeFile(path.join(TEST_DIR, 'video2.mkv'), 'fake');
    await fs.writeFile(path.join(TEST_DIR, 'notavideo.txt'), 'fake');
    await fs.writeFile(path.join(TEST_DIR, 'subdir', 'video3.flv'), 'fake');

    // 创建测试数据文件
    const data = {
      rooms: [
        {
          roomId: 'custom_room',
          title: '自定义房间',
          cover: '',
          userName: '自定义主播',
          online: 100,
          filePath: '/data/videos/custom.mp4',
        },
      ],
    };
    await fs.writeFile(TEST_DATA_FILE, JSON.stringify(data));
  });

  after(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.rm(TEST_DATA_FILE, { force: true });
  });

  it('应从目录扫描生成房间列表', async () => {
    const scanner = new LocalVideoScanner(TEST_DIR, '');
    await scanner.load();

    const rooms = scanner.getRooms();
    assert.equal(rooms.length, 3, '应扫描到 3 个视频文件');

    const roomIds = rooms.map((r) => r.roomId);
    assert.ok(roomIds.includes('video1'), '应包含 video1');
    assert.ok(roomIds.includes('video2'), '应包含 video2');
    assert.ok(roomIds.includes('video3'), '应包含 video3（子目录）');

    // 验证房间属性
    const room1 = scanner.findRoom('video1');
    assert.ok(room1);
    assert.equal(room1.title, 'video1');
    assert.equal(room1.userName, '本地直播');
    assert.equal(room1.online, 999);
    assert.ok(room1.filePath.endsWith('video1.mp4'));
  });

  it('应优先从数据文件加载', async () => {
    const scanner = new LocalVideoScanner(TEST_DIR, TEST_DATA_FILE);
    await scanner.load();

    const rooms = scanner.getRooms();
    assert.equal(rooms.length, 1, '应只包含数据文件中的 1 个房间');

    const room = scanner.findRoom('custom_room');
    assert.ok(room);
    assert.equal(room.title, '自定义房间');
    assert.equal(room.userName, '自定义主播');
    assert.equal(room.online, 100);
    assert.equal(room.filePath, '/data/videos/custom.mp4');
  });

  it('应支持按 roomId 查找', async () => {
    const scanner = new LocalVideoScanner(TEST_DIR, '');
    await scanner.load();

    const room = scanner.findRoom('video1');
    assert.ok(room);
    assert.equal(room.roomId, 'video1');

    const notFound = scanner.findRoom('nonexistent');
    assert.equal(notFound, undefined);
  });

  it('应支持标题模糊搜索', async () => {
    const scanner = new LocalVideoScanner(TEST_DIR, '');
    await scanner.load();

    const results = scanner.searchRooms('video');
    assert.equal(results.length, 3);

    const noResults = scanner.searchRooms('nonexistent');
    assert.equal(noResults.length, 0);
  });

  it('应支持分页获取', async () => {
    const scanner = new LocalVideoScanner(TEST_DIR, '');
    await scanner.load();

    const page1 = scanner.getRoomsByPage(1);
    assert.equal(page1.items.length, 3);
    assert.equal(page1.hasMore, false);
  });

  it('目录不存在时应返回空列表', async () => {
    const scanner = new LocalVideoScanner('/nonexistent/path', '');
    await scanner.load();

    const rooms = scanner.getRooms();
    assert.equal(rooms.length, 0);
  });

  it('数据文件格式无效时应回退到目录扫描', async () => {
    const invalidFile = path.join(import.meta.dirname, 'invalid_data.json');
    await fs.writeFile(invalidFile, '{ invalid json }');

    const scanner = new LocalVideoScanner(TEST_DIR, invalidFile);
    await scanner.load();

    const rooms = scanner.getRooms();
    assert.equal(rooms.length, 3, '应回退扫描目录');

    await fs.rm(invalidFile, { force: true });
  });

  it('非演示模式扫描时 cover/avatar 应为空', async () => {
    const scanner = new LocalVideoScanner(TEST_DIR, '');
    await scanner.load();

    const rooms = scanner.getRooms();
    assert.equal(rooms.length, 3);
    for (const room of rooms) {
      assert.equal(room.cover, '', '非演示模式 cover 应为空');
      assert.equal(room.avatar, '', '非演示模式 avatar 应为空');
    }
  });

  it('演示模式扫描时 cover/avatar 字段为空或相对路径 URL（无 ffmpeg 时降级为空）', async () => {
    const coverDir = path.join(import.meta.dirname, 'test_covers');
    const avatarDir = path.join(import.meta.dirname, 'test_avatars');
    // 封面/头像使用相对路径前缀，客户端拼接自身 serverURL 即可访问
    const coverBaseUrl = '/api/v1/stream/covers';
    const avatarBaseUrl = '/api/v1/stream/avatars';
    // 使用不存在的 ffmpeg 路径，验证降级行为
    const scanner = new LocalVideoScanner(
      TEST_DIR,
      '',
      true,                                  // demoMode
      coverDir,
      coverBaseUrl,
      '/nonexistent/ffmpeg',                 // ffmpegPath
      avatarDir,
      avatarBaseUrl,
    );
    await scanner.load();

    const rooms = scanner.getRooms();
    assert.equal(rooms.length, 3);
    // 无 ffmpeg 时降级为空字符串，不阻断扫描
    for (const room of rooms) {
      assert.equal(room.cover, '', '无 ffmpeg 时 cover 应降级为空');
      assert.equal(room.avatar, '', '无 ffmpeg 时 avatar 应降级为空');
    }

    // 清理
    await fs.rm(coverDir, { recursive: true, force: true });
    await fs.rm(avatarDir, { recursive: true, force: true });
  });

  it('typeIcon 应按文件名关键词匹配（不依赖 ffmpeg）', async () => {
    // 使用独立的测试目录，避免影响其它用例的房间数量断言
    const iconDir = path.join(import.meta.dirname, 'test_typeicons');
    await fs.mkdir(iconDir, { recursive: true });
    try {
      await fs.writeFile(path.join(iconDir, 'anime_episode01.mp4'), 'fake');
      await fs.writeFile(path.join(iconDir, 'movie_1080p.mkv'), 'fake');
      await fs.writeFile(path.join(iconDir, 'music_concert.flv'), 'fake');
      await fs.writeFile(path.join(iconDir, 'random_video.mp4'), 'fake');

      const scanner = new LocalVideoScanner(iconDir, '');
      await scanner.load();

      const rooms = scanner.getRooms();
      assert.equal(rooms.length, 4);

      const byId = new Map(rooms.map((r) => [r.roomId, r]));
      assert.equal(byId.get('anime_episode01')?.typeIcon, 'anime');
      assert.equal(byId.get('movie_1080p')?.typeIcon, 'movie');
      assert.equal(byId.get('music_concert')?.typeIcon, 'music');
      assert.equal(byId.get('random_video')?.typeIcon, 'default', '未命中应返回 default');
    } finally {
      await fs.rm(iconDir, { recursive: true, force: true });
    }
  });

  it('typeIcon 应支持子目录路径匹配', async () => {
    const iconDir = path.join(import.meta.dirname, 'test_typeicons_subdir');
    await fs.mkdir(path.join(iconDir, 'anime'), { recursive: true });
    await fs.mkdir(path.join(iconDir, 'tech'), { recursive: true });
    try {
      await fs.writeFile(path.join(iconDir, 'anime', 'episode01.mp4'), 'fake');
      await fs.writeFile(path.join(iconDir, 'tech', 'tutorial.mp4'), 'fake');

      const scanner = new LocalVideoScanner(iconDir, '');
      await scanner.load();

      const rooms = scanner.getRooms();
      assert.equal(rooms.length, 2);

      const byId = new Map(rooms.map((r) => [r.roomId, r]));
      assert.equal(byId.get('episode01')?.typeIcon, 'anime', '子目录 anime 应匹配 anime');
      assert.equal(byId.get('tutorial')?.typeIcon, 'tech', '子目录 tech 应匹配 tech');
    } finally {
      await fs.rm(iconDir, { recursive: true, force: true });
    }
  });

  it('数据文件含 avatar/typeIcon 字段时应正确加载', async () => {
    const dataFile = path.join(import.meta.dirname, 'test_avatar_data.json');
    const data = {
      rooms: [
        {
          roomId: 'avatar_room',
          title: '带头像的房间',
          cover: '/api/v1/stream/covers/avatar_room.jpg',
          userName: '自定义主播',
          online: 50,
          filePath: '/data/videos/custom.mp4',
          avatar: '/api/v1/stream/avatars/avatar_room.jpg',
          typeIcon: 'game',
        },
      ],
    };
    await fs.writeFile(dataFile, JSON.stringify(data));
    try {
      const scanner = new LocalVideoScanner(TEST_DIR, dataFile);
      await scanner.load();

      const room = scanner.findRoom('avatar_room');
      assert.ok(room);
      assert.equal(room.avatar, '/api/v1/stream/avatars/avatar_room.jpg');
      assert.equal(room.typeIcon, 'game');
    } finally {
      await fs.rm(dataFile, { force: true });
    }
  });

  it('数据文件无 avatar/typeIcon 字段时应降级为默认值', async () => {
    const dataFile = path.join(import.meta.dirname, 'test_no_avatar_data.json');
    const data = {
      rooms: [
        {
          roomId: 'no_avatar_room',
          title: '无头像的房间',
          cover: '',
          userName: '自定义主播',
          online: 100,
          filePath: '/data/videos/custom.mp4',
        },
      ],
    };
    await fs.writeFile(dataFile, JSON.stringify(data));
    try {
      const scanner = new LocalVideoScanner(TEST_DIR, dataFile);
      await scanner.load();

      const room = scanner.findRoom('no_avatar_room');
      assert.ok(room);
      assert.equal(room.avatar, '', '无 avatar 字段应降级为空');
      assert.equal(room.typeIcon, 'default', '无 typeIcon 字段应降级为 default');
    } finally {
      await fs.rm(dataFile, { force: true });
    }
  });
});
