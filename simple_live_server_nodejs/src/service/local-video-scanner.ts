/**
 * 本地视频扫描器
 *
 * 用于 local 虚拟平台，扫描服务器本地视频文件目录生成房间数据。
 * 支持两种数据来源：
 * 1. 优先读取 LOCAL_DATA_FILE 指定的 JSON 文件（允许手动定制）
 * 2. 若 JSON 文件不存在，自动扫描 LOCAL_VIDEO_DIR 目录
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { LocalRoomData } from '../core/model/local-room-data.js';
import { CoreLog } from '../core/index.js';

/** 支持的视频文件扩展名 */
const VIDEO_EXTENSIONS = [
  '.mp4', '.mkv', '.flv', '.ts', '.avi', '.mov', '.webm',
];

/** 每页默认大小 */
const PAGE_SIZE = 20;

/** 固定在线人数 */
const DEFAULT_ONLINE = 999;

/** 固定主播名 */
const DEFAULT_USER_NAME = '本地直播';

/**
 * 类型图标关键词映射表
 *
 * 按顺序匹配（更具体的关键词在前，避免误判），命中首个即返回对应 icon key。
 * 匹配对象为文件相对路径（含子目录）的小写形式，支持目录级分类。
 *
 * key 集合（客户端 assets 映射契约）：anime / movie / music / game / landscape / tech / default
 */
const TYPE_ICON_KEYWORDS: ReadonlyArray<{ keys: readonly string[]; icon: string }> = [
  { keys: ['anime', '动画', '番剧', 'ova', '剧场版'], icon: 'anime' },
  { keys: ['movie', '电影', '影院'], icon: 'movie' },
  { keys: ['music', '音乐', '演唱会', 'concert', 'mv', 'mtv'], icon: 'music' },
  { keys: ['game', '游戏', '实况', '直播录像', '通关'], icon: 'game' },
  { keys: ['landscape', '风景', '自然', 'scenery', '旅行', 'travel'], icon: 'landscape' },
  { keys: ['tech', '科技', '教程', 'tutorial', '编程'], icon: 'tech' },
];

export class LocalVideoScanner {
  /** 已加载的房间列表 */
  private _rooms: LocalRoomData[] = [];

  /** roomId -> LocalRoomData 索引 */
  private _roomIndex = new Map<string, LocalRoomData>();

  /** 视频文件目录 */
  readonly videoDir: string;

  /** 数据文件路径（可为空） */
  readonly dataFile: string;

  /** 演示模式：开启后扫描时截取视频第一帧作为封面 */
  readonly demoMode: boolean;

  /** 封面图片存储目录 */
  readonly coverDir: string;

  /** 封面图片访问的基础 URL（如 http://host:port/api/v1/stream/covers） */
  readonly coverBaseUrl: string;

  /** 头像图片存储目录 */
  readonly avatarDir: string;

  /** 头像图片访问的基础 URL（相对路径前缀，如 /api/v1/stream/avatars） */
  readonly avatarBaseUrl: string;

  /** ffmpeg 可执行文件路径 */
  readonly ffmpegPath: string;

  constructor(
    videoDir: string,
    dataFile: string = '',
    demoMode: boolean = false,
    coverDir: string = '',
    coverBaseUrl: string = '',
    ffmpegPath: string = 'ffmpeg',
    avatarDir: string = '',
    avatarBaseUrl: string = '',
  ) {
    this.videoDir = videoDir;
    this.dataFile = dataFile;
    this.demoMode = demoMode;
    this.coverDir = coverDir;
    this.coverBaseUrl = coverBaseUrl;
    this.ffmpegPath = ffmpegPath;
    this.avatarDir = avatarDir;
    this.avatarBaseUrl = avatarBaseUrl;
  }

  /**
   * 启动时加载：优先读 dataFile，不存在则扫描 videoDir
   */
  async load(): Promise<void> {
    // 优先尝试读取数据文件
    if (this.dataFile) {
      const loaded = await this._loadFromDataFile();
      if (loaded) {
        CoreLog.info(`[LocalVideoScanner] 从数据文件加载 ${this._rooms.length} 个房间: ${this.dataFile}`);
        return;
      }
    }

    // 数据文件不存在或加载失败，扫描目录
    await this._loadFromDirectory();
    CoreLog.info(`[LocalVideoScanner] 扫描目录加载 ${this._rooms.length} 个房间: ${this.videoDir}`);
  }

  /**
   * 获取所有房间
   */
  getRooms(): LocalRoomData[] {
    return this._rooms;
  }

  /**
   * 按 roomId 查找
   */
  findRoom(roomId: string): LocalRoomData | undefined {
    return this._roomIndex.get(roomId);
  }

  /**
   * 搜索房间（标题模糊匹配，不区分大小写）
   */
  searchRooms(keyword: string): LocalRoomData[] {
    if (!keyword) return [];
    const lower = keyword.toLowerCase();
    return this._rooms.filter(
      (r) =>
        r.title.toLowerCase().includes(lower) ||
        r.userName.toLowerCase().includes(lower),
    );
  }

  /**
   * 分页获取房间
   *
   * @param page 页码，从 1 开始
   * @returns { items, hasMore }
   */
  getRoomsByPage(page: number = 1): { items: LocalRoomData[]; hasMore: boolean } {
    const start = (page - 1) * PAGE_SIZE;
    const items = this._rooms.slice(start, start + PAGE_SIZE);
    const hasMore = start + PAGE_SIZE < this._rooms.length;
    return { items, hasMore };
  }

  // ====== 私有方法 ======

  /**
   * 从 JSON 数据文件加载
   *
   * @returns 是否成功加载
   */
  private async _loadFromDataFile(): Promise<boolean> {
    try {
      const content = await fs.readFile(this.dataFile, 'utf-8');
      const data = JSON.parse(content) as { rooms?: unknown[] };

      if (!data.rooms || !Array.isArray(data.rooms)) {
        CoreLog.warn(`[LocalVideoScanner] 数据文件格式无效，缺少 rooms 数组: ${this.dataFile}`);
        return false;
      }

      const rooms: LocalRoomData[] = [];
      const usedIds = new Set<string>();

      for (const item of data.rooms) {
        if (typeof item !== 'object' || item === null) continue;
        const room = LocalRoomData.fromJson(item as Record<string, unknown>);

        // 跳过无效数据
        if (!room.roomId || !room.filePath) {
          CoreLog.warn(`[LocalVideoScanner] 跳过无效房间数据: ${JSON.stringify(item)}`);
          continue;
        }

        // roomId 去重
        let finalId = room.roomId;
        let suffix = 1;
        while (usedIds.has(finalId)) {
          finalId = `${room.roomId}_${suffix}`;
          suffix++;
        }

        const finalRoom = new LocalRoomData(
          finalId,
          room.title || finalId,
          room.cover,
          room.userName || DEFAULT_USER_NAME,
          room.online || DEFAULT_ONLINE,
          room.filePath,
          room.avatar,
          room.typeIcon,
        );

        rooms.push(finalRoom);
        usedIds.add(finalId);
      }

      this._setRooms(rooms);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      CoreLog.warn(`[LocalVideoScanner] 读取数据文件失败: ${this.dataFile}, ${msg}`);
      return false;
    }
  }

  /**
   * 从目录扫描加载
   */
  private async _loadFromDirectory(): Promise<void> {
    let rooms: LocalRoomData[] = [];

    try {
      rooms = await this._scanDirectory(this.videoDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      CoreLog.warn(`[LocalVideoScanner] 扫描目录失败: ${this.videoDir}, ${msg}`);
    }

    this._setRooms(rooms);
  }

  /**
   * 递归扫描目录，返回视频文件对应的房间列表
   *
   * 演示模式开启时，会调用 ffmpeg 截取视频第一帧作为封面，
   * cover 字段返回可访问的 HTTP URL；非演示模式 cover 为空。
   */
  private async _scanDirectory(dir: string): Promise<LocalRoomData[]> {
    const rooms: LocalRoomData[] = [];
    const usedIds = new Set<string>();

    await this._walkDirectory(dir, async (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (!VIDEO_EXTENSIONS.includes(ext)) return;

      const fileName = path.basename(filePath, ext);

      // roomId 去重
      let roomId = fileName;
      let suffix = 1;
      while (usedIds.has(roomId)) {
        roomId = `${fileName}_${suffix}`;
        suffix++;
      }
      usedIds.add(roomId);

      // 类型图标：按文件相对路径（含子目录）关键词匹配
      const relativePath = path.relative(this.videoDir, filePath);
      const typeIcon = this._matchTypeIcon(relativePath);

      // 演示模式：截取视频第一帧作为封面 + 中间帧作为头像
      let cover = '';
      let avatar = '';
      if (this.demoMode) {
        cover = await this._extractCover(filePath, roomId);
        avatar = await this._extractAvatar(filePath, roomId);
      }

      rooms.push(new LocalRoomData(
        roomId,
        fileName,
        cover,
        DEFAULT_USER_NAME,
        DEFAULT_ONLINE,
        filePath,
        avatar,
        typeIcon,
      ));
    });

    return rooms;
  }

  /**
   * 用 ffmpeg 截取视频第一帧保存为 jpg，返回封面可访问的 HTTP URL
   *
   * 失败时记录警告并返回空字符串，不阻断扫描流程。
   */
  private async _extractCover(videoPath: string, roomId: string): Promise<string> {
    // 无封面目录或基础 URL，直接返回空
    if (!this.coverDir || !this.coverBaseUrl) {
      return '';
    }

    // 确保 coverDir 存在
    try {
      await fs.mkdir(this.coverDir, { recursive: true });
    } catch {
      CoreLog.warn(`[LocalVideoScanner] 创建封面目录失败: ${this.coverDir}`);
      return '';
    }

    const coverFileName = `${roomId}.jpg`;
    const coverPath = path.join(this.coverDir, coverFileName);

    return new Promise<string>((resolve) => {
      const proc = spawn(this.ffmpegPath, [
        '-ss', '0',
        '-i', videoPath,
        '-frames:v', '1',
        '-q:v', '2',
        '-f', 'image2',
        '-y',
        coverPath,
      ], { stdio: ['ignore', 'ignore', 'ignore'] });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve(`${this.coverBaseUrl}/${coverFileName}`);
        } else {
          CoreLog.warn(`[LocalVideoScanner] 截取封面失败: ${videoPath}, exitCode=${code}`);
          resolve('');
        }
      });

      proc.on('error', (err) => {
        CoreLog.warn(`[LocalVideoScanner] 截取封面异常: ${videoPath}, ${err.message}`);
        resolve('');
      });
    });
  }

  /**
   * 按文件名关键词匹配类型图标
   *
   * @param relativePath 视频文件相对 videoDir 的路径（含子目录 + 文件名）
   * @returns 命中的 icon key，未命中返回 'default'
   */
  private _matchTypeIcon(relativePath: string): string {
    const lower = relativePath.toLowerCase();
    for (const { keys, icon } of TYPE_ICON_KEYWORDS) {
      for (const key of keys) {
        if (lower.includes(key.toLowerCase())) {
          return icon;
        }
      }
    }
    return 'default';
  }

  /**
   * 用 ffmpeg 截取视频中间帧（10 秒处）保存为 jpg，返回头像可访问的 HTTP URL
   *
   * 失败时记录警告并返回空字符串，不阻断扫描流程。
   * 视频不足 10 秒时 ffmpeg 会失败，头像降级为空。
   */
  private async _extractAvatar(videoPath: string, roomId: string): Promise<string> {
    // 无头像目录或基础 URL，直接返回空
    if (!this.avatarDir || !this.avatarBaseUrl) {
      return '';
    }

    // 确保 avatarDir 存在
    try {
      await fs.mkdir(this.avatarDir, { recursive: true });
    } catch {
      CoreLog.warn(`[LocalVideoScanner] 创建头像目录失败: ${this.avatarDir}`);
      return '';
    }

    const avatarFileName = `${roomId}.jpg`;
    const avatarPath = path.join(this.avatarDir, avatarFileName);

    return new Promise<string>((resolve) => {
      const proc = spawn(this.ffmpegPath, [
        '-ss', '10',
        '-i', videoPath,
        '-frames:v', '1',
        '-q:v', '2',
        '-f', 'image2',
        '-y',
        avatarPath,
      ], { stdio: ['ignore', 'ignore', 'ignore'] });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve(`${this.avatarBaseUrl}/${avatarFileName}`);
        } else {
          CoreLog.warn(`[LocalVideoScanner] 截取头像失败: ${videoPath}, exitCode=${code}`);
          resolve('');
        }
      });

      proc.on('error', (err) => {
        CoreLog.warn(`[LocalVideoScanner] 截取头像异常: ${videoPath}, ${err.message}`);
        resolve('');
      });
    });
  }

  /**
   * 递归遍历目录
   */
  private async _walkDirectory(
    dir: string,
    callback: (filePath: string) => Promise<void>,
  ): Promise<void> {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this._walkDirectory(fullPath, callback);
      } else if (entry.isFile()) {
        await callback(fullPath);
      }
    }
  }

  /**
   * 设置房间列表并构建索引
   */
  private _setRooms(rooms: LocalRoomData[]): void {
    this._rooms = rooms;
    this._roomIndex.clear();
    for (const room of rooms) {
      this._roomIndex.set(room.roomId, room);
    }
  }
}
