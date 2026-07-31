/**
 * LiveDanmaku 抽象基类
 *
 * 对应 Dart 版 simple_live_core/lib/src/interface/live_danmaku.dart
 * 各平台弹幕处理器继承此类，实现具体的弹幕协议。
 */

import { LiveMessage } from '../model/live-message.js';

export type MessageHandler = (msg: LiveMessage) => void;
export type CloseHandler = (msg: string) => void;
export type ReadyHandler = () => void;

export abstract class LiveDanmaku {
  /** 弹幕消息回调 */
  onMessage: MessageHandler | null = null;

  /** 连接关闭回调 */
  onClose: CloseHandler | null = null;

  /** 准备就绪回调 */
  onReady: ReadyHandler | null = null;

  /** 心跳时间（毫秒） */
  heartbeatTime = 0;

  /** 发生心跳 */
  heartbeat(): void {}

  /** 开始接收信息 */
  abstract start(args: unknown): Promise<void>;

  /** 停止接收信息 */
  abstract stop(): Promise<void>;
}
