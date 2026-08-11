# Simple Live Server (Node.js)

聚合直播后端服务，支持 Bilibili、斗鱼、虎牙、抖音四大平台。

基于 Dart 版 `simple_live_server` 重写为 Node.js + TypeScript，完全自包含核心库（`simple_live_core`），零外部 Dart 依赖。

## 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 运行时 | Node.js 22+ | ES2022 + ESNext 模块，内置 SQLite |
| 语言 | TypeScript 5+ | 严格模式 |
| HTTP 框架 | Fastify | 高性能 HTTP/WS 框架 |
| WebSocket | @fastify/websocket | 弹幕 WebSocket |
| 静态文件 | 内置路由 | HLS 分片静态服务 |
| CORS | @fastify/cors | 跨域支持 |
| HTTP 客户端 | axios | 上游 API 请求 |
| JS 引擎 | quickjs-emscripten | 抖音 ABogus/MSSDK 签名 |
| 协议解析 | protobufjs | 抖音弹幕 protobuf |
| 压缩 | zlib (内置) | brotli/zlib 解压 |
| Tars 序列化 | 自定义实现 | 虎牙 CDN Token 协议 |

## 项目结构

```
simple_live_server_nodejs/
├── src/
│   ├── config/
│   │   └── server-config.ts          # 服务配置
│   ├── core/                         # 核心库（自包含 simple_live_core）
│   │   ├── common/                   # 通用工具
│   │   │   ├── binary-writer.ts       # 二进制读写
│   │   │   ├── core-error.ts         # 异常
│   │   │   ├── core-log.ts           # 日志
│   │   │   ├── http-client.ts        # HTTP 客户端
│   │   │   └── web-socket-util.ts    # WebSocket 工具
│   │   ├── danmaku/                  # 弹幕协议实现
│   │   │   ├── bilibili-danmaku.ts   # B站弹幕 (brotli/zlib)
│   │   │   ├── douyu-danmaku.ts      # 斗鱼弹幕 (STT)
│   │   │   ├── huya-danmaku.ts       # 虎牙弹幕 (Tars)
│   │   │   └── douyin-danmaku.ts     # 抖音弹幕 (protobuf)
│   │   ├── interface/                # 抽象接口
│   │   │   ├── live-danmaku.ts       # 弹幕基类
│   │   │   └── live-site.ts          # 站点基类
│   │   ├── model/                    # 数据模型
│   │   ├── scripts/                  # 签名脚本
│   │   │   ├── scripts/*.js          # 签名 JS 文件
│   │   │   ├── douyin-sign.ts        # 抖音签名
│   │   │   └── douyu-sign.ts         # 斗鱼签名
│   │   ├── sites/                    # 平台适配
│   │   │   ├── bilibili-site.ts
│   │   │   ├── douyu-site.ts
│   │   │   ├── huya-site.ts
│   │   │   └── douyin-site.ts
│   │   ├── tars/                     # Tars 序列化
│   │   │   ├── models/               # Tars 模型
│   │   │   ├── tars-codec.ts         # 编解码器
│   │   │   ├── tars-http.ts          # TUP3 HTTP
│   │   │   └── tars-struct.ts        # 基类
│   │   ├── utils/
│   │   │   └── quickjs-runtime.ts    # QuickJS 封装
│   │   └── index.ts                  # 统一导出
│   ├── dto/
│   │   └── api-response.ts           # 统一响应
│   ├── router/                       # 路由层
│   │   ├── route-helpers.ts           # 辅助方法
│   │   ├── site-routes.ts            # 平台/分类/搜索
│   │   ├── room-routes.ts            # 房间/播放
│   │   ├── stream-routes.ts          # 转封装
│   │   ├── danmaku-routes.ts         # 弹幕 WS
│   │   ├── sync-routes.ts            # 同步
│   │   └── cookie-routes.ts          # Cookie
│   ├── service/                      # 服务层
│   │   ├── live-site-service.ts      # 站点服务
│   │   ├── danmaku-manager.ts        # 弹幕管理
│   │   ├── ffmpeg-stream-manager.ts  # 进程池
│   │   └── sync-data-manager.ts      # 数据同步
│   ├── app.ts                        # Fastify 应用
│   └── index.ts                     # 入口
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

## 快速开始

### Docker 部署（推荐）

```bash
# 构建并启动
docker compose up -d

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

### 本地开发

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 编译
npm run build

# 生产模式
npm start
```

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | 8089 | 监听端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `ENABLE_LOG` | true | 是否启用日志 |
| `MAX_DANMAKU_CONNECTIONS` | 100 | 弹幕最大并发连接数 |
| `MAX_STREAM_SESSIONS` | 20 | ffmpeg 转封装最大会话数 |
| `STREAM_DIR` | /tmp/live_stream | HLS 分片临时目录 |
| `STREAM_IDLE_TIMEOUT` | 30 | 空闲进程关闭延迟（秒） |
| `DEMO_MODE` | false | 演示模式（开启后只显示 local 平台，用于 Apple Store 审核） |
| `LOCAL_VIDEO_DIR` | /data/videos | 本地视频文件目录（local 平台数据源） |
| `LOCAL_DATA_FILE` | (空) | 本地数据 JSON 文件路径（为空则自动扫描目录） |
| `COVER_DIR` | /tmp/live_stream/covers | 封面图片存储目录（演示模式截取视频第一帧保存位置） |
| `AVATAR_DIR` | /tmp/live_stream/avatars | 头像图片存储目录（演示模式截取视频中间帧保存位置） |
| `SYNC_DB_PATH` | /data/sync_data.db | 同步数据 SQLite 数据库路径（关注/观看记录等持久化，为空则纯内存模式） |
| `BILIBILI_COOKIE` | (空) | B站 Cookie（可选） |
| `DOUYIN_COOKIE` | (空) | 抖音 Cookie（可选） |

## API 接口

所有 API 前缀：`/api/v1`

### 平台

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/sites` | 获取所有平台 |
| GET | `/sites/:siteId/categories` | 获取分类列表 |
| GET | `/sites/:siteId/recommend?page=1` | 获取推荐房间 |
| GET | `/sites/:siteId/categories/rooms?categoryId=&page=1` | 获取分类下房间 |
| GET | `/sites/:siteId/search/rooms?keyword=&page=1` | 搜索直播间 |
| GET | `/sites/:siteId/search/anchors?keyword=&page=1` | 搜索主播 |

### 房间

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/sites/:siteId/rooms/:roomId` | 房间详情 |
| GET | `/sites/:siteId/rooms/:roomId/live-status` | 直播状态 |
| GET | `/sites/:siteId/rooms/:roomId/qualities` | 清晰度列表 |
| POST | `/sites/:siteId/rooms/:roomId/play-urls` | 播放直链 |
| GET | `/sites/:siteId/rooms/:roomId/super-chat` | SC 消息 |

### 流播放

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/stream/playback?siteId=&roomId=&quality=` | 获取播放端点 |
| POST | `/stream/transcode` | FLV 转 HLS |
| GET | `/stream/hls/:sessionId/*` | HLS 静态文件 |
| GET | `/stream/covers/:filename` | 封面图片静态文件（演示模式） |
| GET | `/stream/avatars/:filename` | 头像图片静态文件（演示模式） |

### 弹幕

| 方法 | 路径 | 说明 |
|------|------|------|
| WS | `/sites/:siteId/rooms/:roomId/danmaku` | 弹幕 WebSocket |

### 同步

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/sync/follow` | 关注列表 |
| GET/POST | `/sync/tag` | 标签 |
| GET/POST | `/sync/history` | 观看记录 |
| GET/POST | `/sync/blocked_word` | 屏蔽词 |
| GET/POST | `/sync/settings` | 设置 |

同步接口需在请求头携带 `X-Device-Id` 用于数据分区。

### Cookie

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/cookie/:siteId` | 获取 Cookie |
| PUT | `/cookie/:siteId` | 更新 Cookie |
| DELETE | `/cookie/:siteId` | 删除 Cookie |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/` | 服务状态 |

## 响应格式

所有 API 返回统一的 JSON 格式：

```json
{
  "code": 0,
  "data": { "roomId": "123", "title": "标题" },
  "msg": ""
}
```

错误时：

```json
{
  "code": 500,
  "data": null,
  "msg": "错误信息"
}
```

## 支持平台

| 平台 | siteId | 弹幕协议 | 特殊能力 |
|------|--------|---------|---------|
| 哔哩哔哩 | bilibili | brotli/zlib 二进制 | WBI 签名 |
| 斗鱼 | douyu | STT 文本协议 | CryptoJS 签名 |
| 虎牙 | huya | Tars 二进制 | TUP3 协议 |
| 抖音 | douyin | protobuf + gzip | ABogus/MSSDK 签名 |
| 本地直播 | local | 无（空实现） | 本地视频文件转 HLS 直播流 |

## 依赖说明

- **ffmpeg**：转封装服务需要安装 ffmpeg（Docker 镜像已包含）
- **quickjs-emscripten**：用于在 Node.js 中运行 JS 签名脚本，无需 Python 环境
- **protobufjs**：抖音弹幕使用 protobuf 协议

## 与 Dart 版的差异

1. 完全自包含核心库，不依赖 `pub.dev` 上的 `simple_live_core`
2. 使用 Fastify 替代 Shelf，性能更优
3. 使用 `@fastify/websocket` 替代 `shelf_web_socket`
4. 使用 `child_process.spawn` 替代 `dart:io Process.start`
5. 使用 Node.js 内置 `zlib` 替代第三方 brotli 库
6. 同步数据（关注/观看记录等）支持 SQLite 持久化（基于 Node.js 22+ 内置 `node:sqlite`），服务重启不丢失

## 演示模式与本地直播流

### 演示模式

用于 Apple Store 审核，开启后 `/api/v1/sites` 只返回 `local` 平台，隐藏所有真实直播平台。非演示模式下 `local` 平台不会显示在首页。

```bash
# 环境变量
DEMO_MODE=true
```

### 视频封面与头像截取

演示模式开启后，扫描视频目录时会调用 ffmpeg 截取每个视频的帧保存为 jpg 图片：

- **封面（cover）**：截取第 0 秒第一帧，`cover` 字段返回可访问的相对 URL（形如 `/api/v1/stream/covers/<roomId>.jpg`）
- **头像（avatar）**：截取第 10 秒中间帧，`userAvatar` 字段（房间详情）返回可访问的相对 URL（形如 `/api/v1/stream/avatars/<roomId>.jpg`）。视频不足 10 秒时截取失败，头像降级为空，详情页回退使用封面兜底

截取参数：

- 封面图片存储目录由 `COVER_DIR` 环境变量控制，默认 `/tmp/live_stream/covers`
- 头像图片存储目录由 `AVATAR_DIR` 环境变量控制，默认 `/tmp/live_stream/avatars`
- 截帧失败不会阻断扫描流程，对应字段降级为空字符串
- 非演示模式不截取封面/头像，`cover`/`avatar` 字段均为空

### 类型图标（typeIcon）

列表项 `typeIcon` 字段按视频文件相对路径（含子目录）的关键词匹配返回图标 key，客户端自行映射 assets 资源。服务端只产出 key，不提供图片资源。

**key 集合（客户端 assets 映射契约）**：

| key | 匹配关键词（不区分大小写） |
|-----|--------------------------|
| `anime` | anime、动画、番剧、ova、剧场版 |
| `movie` | movie、电影、影院 |
| `music` | music、音乐、演唱会、concert、mv、mtv |
| `game` | game、游戏、实况、直播录像、通关 |
| `landscape` | landscape、风景、自然、scenery、旅行、travel |
| `tech` | tech、科技、教程、tutorial、编程 |
| `default` | 未命中任何关键词时的默认值 |

匹配按上表顺序进行，命中首个即返回（更具体的关键词在前）。支持目录级分类，例如 `/anime/episode01.mp4` 匹配 `anime`。

### 本地直播流（local 平台）

`local` 是一个虚拟平台，将服务器本地视频文件转为 HLS 直播流播放。

**工作原理**：
1. 服务启动时扫描 `LOCAL_VIDEO_DIR` 目录下的视频文件（mp4/mkv/flv/ts/avi/mov/webm）
2. 每个视频文件生成一个"房间"，出现在首页推荐和搜索中
3. 播放时用 ffmpeg `-re -stream_loop -1` 将文件转为循环播放的 HLS 直播流
4. 分片不删除（不用 `delete_segments`），用 ffprobe 探测视频时长预算一轮分片数 N=ceil(时长/2)，m3u8 窗口大小取 N 恰好覆盖一轮
5. 播放器请求超出当前 m3u8 窗口的 ts 序号时，服务端按 `序号 % N` 映射到首轮分片，实现循环播放兜底，避免 404 卡在最后一个分片

**数据来源（二选一）**：
- **自动扫描**（默认）：`LOCAL_DATA_FILE` 为空时，递归扫描 `LOCAL_VIDEO_DIR` 目录
- **手动定制**：指定 `LOCAL_DATA_FILE` 为 JSON 文件路径，可自定义标题、封面、主播名等

**数据文件格式**：

```json
{
  "rooms": [
    {
      "roomId": "demo_stream_01",
      "title": "示例直播 - 风景",
      "cover": "",
      "userName": "本地直播",
      "online": 999,
      "filePath": "/data/videos/landscape.mp4",
      "avatar": "",
      "typeIcon": "landscape"
    }
  ]
}
```

**Docker 部署示例**：

```yaml
environment:
  - DEMO_MODE=true
  - LOCAL_VIDEO_DIR=/data/videos
volumes:
  - ./videos:/data/videos:ro
```

**本地开发**：

```bash
# 将视频文件放入目录
mkdir -p /data/videos
cp ~/Videos/demo.mp4 /data/videos/

# 启动服务（开启演示模式）
DEMO_MODE=true LOCAL_VIDEO_DIR=/data/videos npm start
```

## 许可证

MIT
