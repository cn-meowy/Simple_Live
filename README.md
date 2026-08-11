> ### ⚠ 本项目不提供Release安装包，请自行编译后运行测试。


<p align="center">
    <img width="128" src="/assets/MeowLive.png" alt="Meow Live logo">
</p>
<h2 align="center">Meow Live</h2>

<p align="center">
简简单单的看直播 · 自建服务端聚合直播
</p>

![浅色模式](/assets/screenshot_light.jpg)

![深色模式](/assets/screenshot_dark.jpg)

## 简介

Meow Live 基于 [xiaoyaocz/dart_simple_live](https://github.com/xiaoyaocz/dart_simple_live) fork 演进，在原版「直连各平台」的基础上引入了**统一服务端架构**：客户端首页平台列表完全由后端 `/api/v1/sites` 驱动，不再内置平台 Tab。

本分支的主要演进：

- **自建 Node.js 后端**（`simple_live_server_nodejs`）：Fastify + WebSocket，Docker 部署，演示模式，本地直播流，数据同步持久化。
- **Apple TV (tvOS) 原生客户端**（`simple_live_apple_tv`）：Swift/SwiftUI 实现，依赖服务端 FLV→HLS 转封装。
- **JS 脚本站点系统**：基于 `dart_quickjs` 的 `ScriptLiveSite`，支持动态安装/卸载 JS 站点扩展平台，弹幕仍走内置原生实现。
- **核心库合并**：`simple_live_core` 已合并进 `simple_live_app/lib/core`，app 不再依赖外部核心包。

## 支持直播平台

- 虎牙直播
- 斗鱼直播
- 哔哩哔哩直播
- 抖音直播
- 演示模式下额外提供 `local` 本地直播流平台（用于 Apple Store 审核）

## 客户端支持平台

| 客户端 | 支持平台 | 播放方式 |
|--------|---------|---------|
| `simple_live_app` | Android、iOS、Windows、MacOS、Linux | 直连 FLV/HLS，或经服务端转 HLS |
| `simple_live_tv_app` | Android TV | 直连 FLV/HLS，或经服务端转 HLS |
| `simple_live_apple_tv` | Apple TV (tvOS 17.0+) `新增` | 依赖服务端 ffmpeg 转 HLS（tvOS 原生不支持 FLV） |

> Windows/MacOS/Linux/Android TV 当前为 `BETA` 状态。

## 项目结构

| 模块 | 说明 | 技术栈 / 备注 |
|------|------|--------------|
| `simple_live_app` | Flutter APP 客户端（移动端/桌面端） | 核心库已合并进 `app/lib/core`；JS 脚本站点系统、自建服务端模式、内嵌服务、账号登录、数据同步 |
| `simple_live_tv_app` | Flutter Android TV 客户端 | 依赖 `simple_live_core`（path）；新增自建服务端（后台服务）支持 |
| `simple_live_apple_tv` `新增` | Apple TV (tvOS) 原生客户端 | Swift 5.9+ / SwiftUI + AVKit，MVVM；依赖服务端 FLV→HLS 转封装 |
| `simple_live_server_nodejs` `新增` | Node.js + TypeScript 后端服务 | Fastify 5 + WebSocket，Docker 部署，演示模式，本地直播流，SQLite 数据同步 |
| `simple_live_core` | 聚合直播核心库（Dart） | 仍保留供 `simple_live_console` / `simple_live_tv_app` 依赖；app 已自包含副本 |
| `simple_live_console` | 控制台程序 | 基于 `simple_live_core` |

## 架构概览

相比原版的「直连各平台」模式，本分支已移除直连——服务端地址为必填项（`live_api_factory.dart`：地址为空时抛 `StateError`）。由配置的服务端地址决定**两种工作方式**：

1. **自建服务端模式**：配置远程服务端地址，客户端连接 `simple_live_server_nodejs` 或其他兼容后端。首页平台列表、分类、搜索、同步、Cookie 管理均经服务端接口。
2. **内嵌服务模式**：配置本机地址（`127.0.0.1` / `localhost` / 本机网卡 IP），客户端自动启动 `EmbeddedLiveServer`（Shelf 实现，API 契约与 Node.js 服务端一致），绑定随机端口仅本机访问。

> **首页平台列表后端驱动**：`sites.dart` 的 `supportSites` 返回后端 `/api/v1/sites` 拉取的站点列表，无本地回退。内置站点注册表仅用于弹幕、账号登录、解析等 SDK 内部用途，不再参与首页 Tab 展示。

后端 API 细节、环境变量、Docker 配置见 [simple_live_server_nodejs/README.md](simple_live_server_nodejs/README.md)。

### 关键特性

- **JS 脚本站点系统**：`ScriptLiveSite` + `JsEngine`（`dart_quickjs`），支持动态安装/卸载 JS 站点扩展平台；弹幕仍走内置原生实现。
- **演示模式**：服务端 `DEMO_MODE=true` 时只返回 `local` 虚拟平台（本地视频转 HLS 直播流），用于 Apple Store 审核。
- **数据同步**：关注/观看记录/标签/屏蔽词/设置经服务端 SQLite 持久化，设备级同步（`X-Device-Id`）。
- **Cookie/账号管理**：哔哩哔哩二维码登录、抖音 Cookie 经服务端接口管理。
- **Apple TV 差异**：tvOS 原生不支持 FLV，依赖服务端 ffmpeg 转 HLS。

Apple TV 客户端的架构与转封装流程见 [simple_live_apple_tv/MeowLive/README.md](simple_live_apple_tv/MeowLive/README.md)。

## 快速开始

### 后端

```bash
cd simple_live_server_nodejs
docker compose up -d
```

详细部署、环境变量、演示模式配置见 [simple_live_server_nodejs/README.md](simple_live_server_nodejs/README.md)。

### 客户端

1. 在 `simple_live_app` 中配置服务端地址（本机地址触发内嵌服务模式，远程地址连接自建后端）。
2. Flutter 构建运行：

```bash
cd simple_live_app
flutter pub get
flutter run
```

各子模块的详细构建/部署指引见各自目录下的 README。

## 环境

- Flutter：`3.38.x`（见 `.github/workflows/`）
- Node.js：`>=22.0.0`（后端 `simple_live_server_nodejs`）
- Apple TV：Xcode + Swift 5.9+，tvOS 17.0+（见 [simple_live_apple_tv/MeowLive/README.md](simple_live_apple_tv/MeowLive/README.md)）

## 参考及引用

[AllLive](https://github.com/xiaoyaocz/AllLive) `上游项目 xiaoyaocz/dart_simple_live 的 C# 版，本项目基于 dart_simple_live fork 演进`

[dart_simple_live](https://github.com/xiaoyaocz/dart_simple_live) `本项目 fork 来源`

[dart_tars_protocol](https://github.com/xiaoyaocz/dart_tars_protocol.git)

[wbt5/real-url](https://github.com/wbt5/real-url)

[lovelyyoshino/Bilibili-Live-API](https://github.com/lovelyyoshino/Bilibili-Live-API/blob/master/API.WebSocket.md)

[IsoaSFlus/danmaku](https://github.com/IsoaSFlus/danmaku)

[BacooTang/huya-danmu](https://github.com/BacooTang/huya-danmu)

[TarsCloud/Tars](https://github.com/TarsCloud/Tars)

[YunzhiYike/douyin-live](https://github.com/YunzhiYike/douyin-live)

[5ime/Tiktok_Signature](https://github.com/5ime/Tiktok_Signature)

## 声明

本项目的所有功能都是基于互联网上公开的资料开发，无任何破解、逆向工程等行为。

本项目仅用于学习交流编程技术，严禁将本项目用于商业目的。如有任何商业行为，均与本项目无关。

如果本项目存在侵犯您的合法权益的情况，请及时与开发者联系，开发者将会及时删除有关内容。

## Star History

<a href="https://www.star-history.com/#cn-meowy/Simple_Live&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=cn-meowy/Simple_Live&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=cn-meowy/Simple_Live&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=cn-meowy/Simple_Live&type=Date" />
  </picture>
</a>

## License

[GPL-3.0](LICENSE)
