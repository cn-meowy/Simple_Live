/**
 * 抖音签名工具
 *
 * 对应 Dart 版 simple_live_core/lib/src/scripts/douyin_sign.dart
 *
 * 包含三个签名能力：
 * 1. getAbogusUrl - 请求 URL 的 a_bogus 签名（基于 ABogus JS）
 * 2. getSignature - 弹幕 WebSocket 鉴权签名（基于 MSSDK JS）
 * 3. getMsStub / generateMsToken - 辅助方法
 */

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JsRuntime } from '../utils/quickjs-runtime.js';
import { CoreLog } from '../common/core-log.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 读取 JS 脚本文件内容
 *
 * ABogus 和 MSSDK 脚本体积庞大（1万+行），存放在 scripts 目录下的 .js 文件中。
 */
function readScript(filename: string): string {
  const scriptPath = join(__dirname, 'scripts', filename);
  return readFileSync(scriptPath, 'utf-8');
}

export class DouyinSign {
  /** 默认 User-Agent */
  static readonly defaultUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';

  /**
   * 为请求 URL 添加 a_bogus 签名参数
   *
   * 对应 Dart 版 DouyinSign.getAbogusUrl
   *
   * @param url 原始请求 URL（含 query 参数）
   * @param userAgent 用户代理
   * @returns 添加了 msToken 和 a_bogus 参数的新 URL
   */
  static async getAbogusUrl(url: string, userAgent: string): Promise<string> {
    const runtime = new JsRuntime({
      memoryLimit: 4 * 1024 * 1024,
      maxStackSize: 64 * 1024,
    });

    try {
      await runtime.init();

      const msToken = this.generateMsToken(107);
      const params = `${url}&msToken=${msToken}`.split('?')[1] ?? '';
      const query = params.includes('?') ? params.split('?')[1] ?? '' : params;

      const abogusJs = readScript('douyin-abogus.js');
      runtime.eval(abogusJs);

      // 执行 getABogus 函数
      const aBogus = runtime.eval(`getABogus(${JSON.stringify(query)}, ${JSON.stringify(userAgent)})`);

      const newUrl = `${url}&msToken=${encodeURIComponent(msToken)}&a_bogus=${encodeURIComponent(aBogus)}`;
      return newUrl;
    } finally {
      runtime.dispose();
    }
  }

  /**
   * 获取弹幕 WebSocket 鉴权签名
   *
   * 对应 Dart 版 DouyinSign.getSignature
   *
   * @param roomId 房间 ID
   * @param uniqueId 用户唯一 ID
   * @returns MSSDK 签名字符串
   */
  static async getSignature(roomId: string, uniqueId: string): Promise<string> {
    const runtime = new JsRuntime({
      memoryLimit: 4 * 1024 * 1024,
      maxStackSize: 128 * 1024,
    });

    try {
      await runtime.init();

      const mssdkJs = readScript('douyin-mssdk.js');
      runtime.eval(mssdkJs);

      const msStub = this.getMsStub(roomId, uniqueId);

      let signature = runtime.eval(
        `getMSSDKSignature(${JSON.stringify(msStub)}, ${JSON.stringify(this.defaultUserAgent)})`,
      );

      // 如果 signature 中包含 - 或 =，重新生成
      let attempts = 0;
      while ((signature.includes('-') || signature.includes('=')) && attempts < 10) {
        signature = runtime.eval(
          `getMSSDKSignature(${JSON.stringify(msStub)}, ${JSON.stringify(this.defaultUserAgent)})`,
        );
        attempts++;
      }

      return signature;
    } finally {
      runtime.dispose();
    }
  }

  /**
   * 生成 msStub
   *
   * 对应 Dart 版 DouyinSign.getMsStub
   */
  static getMsStub(roomId: string, uniqueId: string): string {
    const params: Record<string, string | number> = {
      live_id: '1',
      aid: '6383',
      version_code: 180800,
      webcast_sdk_version: '1.3.0',
      room_id: roomId,
      sub_room_id: '',
      sub_channel_id: '',
      did_rule: '3',
      user_unique_id: uniqueId,
      device_platform: 'web',
      device_type: '',
      ac: '',
      identity: 'audience',
    };

    const sigParams = Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');

    return createHash('md5').update(sigParams).digest('hex');
  }

  /**
   * 生成随机 msToken
   *
   * 对应 Dart 版 DouyinSign.generateMsToken
   */
  static generateMsToken(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }
}
