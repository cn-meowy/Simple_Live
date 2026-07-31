#!/usr/bin/env node

/**
 * Simple Live Server - 入口文件
 *
 * 对应 Dart 版 simple_live_server/bin/server.dart
 */

import { ServerConfig } from './config/server-config.js';
import { SimpleLiveServer } from './app.js';

async function main(): Promise<void> {
  const config = ServerConfig.fromEnv();
  const server = new SimpleLiveServer(config);

  // 确保退出时清理资源
  process.on('SIGINT', async () => {
    console.log('\n正在关闭服务...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n正在关闭服务...');
    await server.stop();
    process.exit(0);
  });

  await server.start();
}

main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
