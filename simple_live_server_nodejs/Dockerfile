# Dockerfile for Simple Live Server (Node.js)

FROM node:22-slim

WORKDIR /app

# 安装 ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 复制 package.json 和 package-lock.json
COPY package.json package-lock.json* ./

# 安装所有依赖（tsx 用于运行 TypeScript）
RUN npm ci

# 复制源代码
COPY tsconfig.json ./
COPY src/ ./src/

# 创建流目录
RUN mkdir -p /tmp/live_stream

# 创建本地视频目录 + 同步数据目录
RUN mkdir -p /data/videos /data

# 暴露端口
EXPOSE 8089

# 环境变量默认值
ENV NODE_ENV=production
ENV PORT=8089
ENV HOST=0.0.0.0
ENV ENABLE_LOG=true
ENV MAX_DANMAKU_CONNECTIONS=100
ENV MAX_STREAM_SESSIONS=20
ENV STREAM_DIR=/tmp/live_stream
ENV STREAM_IDLE_TIMEOUT=30
ENV DEMO_MODE=false
ENV LOCAL_VIDEO_DIR=/data/videos
ENV LOCAL_DATA_FILE=""
ENV COVER_DIR=/tmp/live_stream/covers
ENV SYNC_DB_PATH=/data/sync_data.db

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8089/health || exit 1

# 启动命令（使用 tsx 直接运行 TypeScript，--experimental-sqlite 启用内置 SQLite）
CMD ["npx", "tsx", "--experimental-sqlite", "src/index.ts"]
