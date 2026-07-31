/**
 * 斗鱼签名工具
 *
 * 对应 Dart 版 simple_live_core/lib/src/scripts/douyu_sign.dart
 *
 * 通过 QuickJS 执行 CryptoJS + 平台 JS 加密脚本，
 * 调用 ub98484234(rid, did, time) 生成签名。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JsRuntime } from '../utils/quickjs-runtime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readScript(filename: string): string {
  const scriptPath = join(__dirname, 'scripts', filename);
  return readFileSync(scriptPath, 'utf-8');
}

export class DouyuSign {
  /**
   * 执行斗鱼加密 JS，获取签名
   *
   * 对应 Dart 版 DouyuSign.getSign
   *
   * @param html 从 homeH5Enc 接口获取的 JS 加密脚本内容
   * @param rid 房间 ID
   * @returns 签名字符串
   */
  static async getSign(html: string, rid: string): Promise<string> {
    const runtime = new JsRuntime({
      memoryLimit: 4 * 1024 * 1024,
      maxStackSize: 64 * 1024,
    });

    try {
      await runtime.init();

      // 加载 CryptoJS 库
      const cryptoJs = readScript('douyu-cryptojs.js');
      runtime.eval(cryptoJs);

      const did = '10000000000000000000000000001501';
      const time = Math.round(Date.now() / 1000);

      // 加载平台加密脚本
      runtime.eval(html);

      // 调用 ub98484234 函数
      const data = runtime.eval(`ub98484234(${JSON.stringify(rid)}, ${JSON.stringify(did)}, ${JSON.stringify(String(time))})`);

      return data;
    } finally {
      runtime.dispose();
    }
  }
}
