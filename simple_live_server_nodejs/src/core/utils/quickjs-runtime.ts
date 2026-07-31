/**
 * QuickJS 运行时封装
 *
 * 对应 Dart 版 dart_quickjs 的 JsRuntime
 * 使用 quickjs-emscripten 在隔离的沙箱中执行签名 JS 脚本。
 *
 * 注意：抖音 ABogus / MSSDK / 斗鱼 CryptoJS 都是在浏览器环境中运行，
 * 部分代码依赖 document/window/navigator 等全局对象，需要提供 mock。
 */

import { getQuickJS, QuickJSContext } from 'quickjs-emscripten';
import { CoreLog } from '../common/core-log.js';

/**
 * QuickJS 运行时实例
 *
 * 对应 Dart 版 JsRuntime，提供 eval / dispose 接口。
 * 每次 getSign / getAbogusUrl 创建新实例，用完即释放。
 */
export class JsRuntime {
  private ctx: QuickJSContext | null = null;
  private readonly memoryLimit: number;
  private readonly maxStackSize: number;

  constructor(options: { memoryLimit?: number; maxStackSize?: number } = {}) {
    this.memoryLimit = options.memoryLimit ?? 4 * 1024 * 1024; // 4MB
    this.maxStackSize = options.maxStackSize ?? 64 * 1024; // 64KB
  }

  /**
   * 初始化 QuickJS 上下文
   */
  async init(): Promise<void> {
    const QuickJS = await getQuickJS();
    this.ctx = QuickJS.newContext();
    // quickjs-emscripten v0.32 不再提供 setMemoryLimit/setMaxStackTrace 接口
    // 内存限制通过 vm 运行时配置处理

    // 提供基础的浏览器环境 mock（部分签名脚本依赖）
    this.setupBrowserEnv();
  }

  /**
   * 执行 JS 代码，返回字符串结果
   *
   * 对应 Dart 版 JsRuntime.eval
   */
  eval(code: string): string {
    if (!this.ctx) {
      throw new Error('QuickJS 上下文未初始化，请先调用 init()');
    }

    const result = this.ctx.evalCode(code);
    if (result.error) {
      const err = this.ctx.dump(result.error);
      result.error.dispose();
      throw new Error(`JS 执行错误: ${err}`);
    }

    const value = this.ctx.dump(result.value);
    result.value.dispose();
    return typeof value === 'string' ? value : String(value ?? '');
  }

  /**
   * 执行 JS 代码，返回任意类型结果
   */
  evalAny(code: string): unknown {
    if (!this.ctx) {
      throw new Error('QuickJS 上下文未初始化，请先调用 init()');
    }

    const result = this.ctx.evalCode(code);
    if (result.error) {
      const err = this.ctx.dump(result.error);
      result.error.dispose();
      throw new Error(`JS 执行错误: ${err}`);
    }

    const value = this.ctx.dump(result.value);
    result.value.dispose();
    return value;
  }

  /** 释放资源 */
  dispose(): void {
    if (this.ctx) {
      try {
        this.ctx.dispose();
      } catch (e) {
        CoreLog.error(e);
      }
      this.ctx = null;
    }
  }

  /**
   * 提供浏览器环境 mock
   *
   * 抖音 MSSDK 依赖 document/window/navigator，提供最小化 mock。
   */
  private setupBrowserEnv(): void {
    if (!this.ctx) return;

    const mockCode = `
      var window = this;
      var self = this;
      var document = {
        cookie: '',
        createElement: function() {
          return {
            getContext: function() { return null; },
            style: {},
            setAttribute: function() {},
            appendChild: function() {},
          };
        },
        getElementById: function() { return null; },
        getElementsByTagName: function() { return []; },
        addEventListener: function() {},
        body: {},
        documentElement: {},
        referrer: '',
        URL: 'https://live.douyin.com/',
        location: { href: 'https://live.douyin.com/' },
      };
      var navigator = {
        userAgent: '',
        platform: 'Win32',
        language: 'zh-CN',
        languages: ['zh-CN', 'zh'],
        cookieEnabled: true,
        hardwareConcurrency: 12,
        deviceMemory: 8,
        onLine: true,
        appVersion: '',
      };
      var location = {
        href: 'https://live.douyin.com/',
        protocol: 'https:',
        host: 'live.douyin.com',
        hostname: 'live.douyin.com',
        origin: 'https://live.douyin.com',
      };
      var screen = {
        width: 1980,
        height: 1080,
        availWidth: 1980,
        availHeight: 1040,
        colorDepth: 24,
        pixelDepth: 24,
      };
      var localStorage = {
        getItem: function() { return null; },
        setItem: function() {},
        removeItem: function() {},
      };
      var sessionStorage = localStorage;
      var performance = {
        now: function() { return Date.now(); },
      };
      var crypto = {
        getRandomValues: function(arr) {
          for (var i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
          }
          return arr;
        },
      };
      var btoa = function(str) {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        var output = '';
        for (var i = 0; i < str.length; i += 3) {
          var byte1 = str.charCodeAt(i) & 0xff;
          var byte2 = i + 1 < str.length ? str.charCodeAt(i + 1) & 0xff : NaN;
          var byte3 = i + 2 < str.length ? str.charCodeAt(i + 2) & 0xff : NaN;
          output += chars.charAt(byte1 >> 2);
          output += chars.charAt(((byte1 & 3) << 4) | (byte2 >> 4));
          output += isNaN(byte2) ? '=' : chars.charAt(((byte2 & 15) << 2) | (byte3 >> 6));
          output += isNaN(byte3) ? '=' : chars.charAt(byte3 & 63);
        }
        return output;
      };
      var atob = function(str) {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        var output = '';
        str = str.replace(/[^A-Za-z0-9\\+\\/=]/g, '');
        for (var i = 0; i < str.length; i += 4) {
          var enc1 = chars.indexOf(str.charAt(i));
          var enc2 = chars.indexOf(str.charAt(i + 1));
          var enc3 = chars.indexOf(str.charAt(i + 2));
          var enc4 = chars.indexOf(str.charAt(i + 3));
          output += String.fromCharCode((enc1 << 2) | (enc2 >> 4));
          if (enc3 !== 64) output += String.fromCharCode(((enc2 & 15) << 4) | (enc3 >> 2));
          if (enc4 !== 64) output += String.fromCharCode(((enc3 & 3) << 6) | enc4);
        }
        return output;
      };
    `;

    this.ctx.evalCode(mockCode);
  }
}

/**
 * 执行一次 JS 签名函数
 *
 * 便捷方法：创建 QuickJS 实例 -> eval 库代码 -> eval 调用代码 -> 释放
 *
 * @param libCode 签名库代码（如 CryptoJS、ABogus 函数定义）
 * @param callCode 调用代码（如 "getABogus('params', 'ua')"）
 * @param options 运行时选项
 */
export async function evalSignFunction(
  libCode: string,
  callCode: string,
  options?: { memoryLimit?: number; maxStackSize?: number },
): Promise<string> {
  const runtime = new JsRuntime(options);
  try {
    await runtime.init();
    runtime.eval(libCode);
    return runtime.eval(callCode);
  } finally {
    runtime.dispose();
  }
}
