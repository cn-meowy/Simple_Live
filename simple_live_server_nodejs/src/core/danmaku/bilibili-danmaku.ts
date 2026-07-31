/**
 * B站弹幕协议实现
 *
 * 对应 Dart 版 simple_live_core/lib/src/danmaku/bilibili_danmaku.dart
 * 二进制协议：16 字节包头 + body，支持 zlib/brotli 压缩
 */

import { LiveDanmaku, MessageHandler, CloseHandler, ReadyHandler } from '../interface/live-danmaku.js';
import { LiveMessage, LiveMessageType, LiveMessageColor, LiveSuperChatMessage } from '../model/live-message.js';
import { WebSocketUtils } from '../common/web-socket-util.js';
import { BinaryWriter, readInt } from '../common/binary-writer.js';
import { CoreLog } from '../common/core-log.js';
import { asT } from '../common/convert-helper.js';
import { brotliDecompressSync, inflateSync } from 'node:zlib';
import { BiliBiliDanmakuArgs } from '../sites/bilibili-site.js';

export class BiliBiliDanmaku extends LiveDanmaku {
  heartbeatTime = 60 * 1000;

  onMessage: MessageHandler | null = null;
  onClose: CloseHandler | null = null;
  onReady: ReadyHandler | null = null;

  private wsUtils: WebSocketUtils | null = null;
  private danmakuArgs!: BiliBiliDanmakuArgs;

  async start(args: unknown): Promise<void> {
    this.danmakuArgs = args as BiliBiliDanmakuArgs;
    const a = this.danmakuArgs;
    this.wsUtils = new WebSocketUtils({
      url: `wss://${a.serverHost}/sub`,
      heartBeatTime: this.heartbeatTime,
      headers: a.cookie ? { cookie: a.cookie } : undefined,
      onMessage: (e) => this.decodeMessage(e),
      onReady: () => { this.onReady?.(); this.joinRoom(this.danmakuArgs); },
      onHeartBeat: () => this.heartbeat(),
      onReconnect: () => this.onClose?.('与服务器断开连接，正在尝试重连'),
      onClose: (e) => this.onClose?.(`服务器连接失败${e}`),
    });
    this.wsUtils.connect();
  }

  private joinRoom(args: BiliBiliDanmakuArgs): void {
    const joinData = this.encodeData(JSON.stringify({
      uid: args.uid, roomid: args.roomId, protover: 3, buvid: args.buvid,
      platform: 'web', type: 2, key: args.token,
    }), 7);
    this.wsUtils?.sendMessage(joinData);
  }

  heartbeat(): void {
    this.wsUtils?.sendMessage(this.encodeData('', 2));
  }

  async stop(): Promise<void> {
    this.onMessage = null;
    this.onClose = null;
    this.wsUtils?.close();
  }

  private encodeData(msg: string, action: number): Buffer {
    const data = Buffer.from(msg, 'utf-8');
    const length = data.length + 16;
    const writer = new BinaryWriter([]);
    writer.writeInt(length, 4);   // 数据包长度
    writer.writeInt(16, 2);        // 数据包头部长度，固定 16
    writer.writeInt(0, 2);         // 协议版本，0=JSON
    writer.writeInt(action, 4);    // 操作类型
    writer.writeInt(1, 4);         // 数据包头部长度，固定 1
    writer.writeBytes(data);
    return writer.toBuffer();
  }

  private decodeMessage(data: Buffer): void {
    try {
      const protocolVersion = readInt(data, 6, 2);
      const operation = readInt(data, 8, 4);
      const body = data.subarray(16);
      if (operation === 3) {
        // 心跳回应，房间人气值
        const online = readInt(body, 0, 4);
        this.onMessage?.(new LiveMessage(LiveMessageType.Online, '', '', LiveMessageColor.white, online));
      } else if (operation === 5) {
        // 通知：弹幕、广播等
        let decompressed = body;
        if (protocolVersion === 2) {
          decompressed = inflateSync(body);
        } else if (protocolVersion === 3) {
          decompressed = brotliDecompressSync(body);
        }
        const text = decompressed.toString('utf-8');
        // 按 ASCII 控制字符分割（JSON 之间无分隔）
        const groups = text.split(/[\x00-\x1f]+/);
        for (const item of groups) {
          if (item.length > 2 && item.startsWith('{')) {
            this.parseMessage(item);
          }
        }
      }
    } catch (e) {
      CoreLog.error(e);
    }
  }

  private parseMessage(jsonMessage: string): void {
    try {
      const obj = JSON.parse(jsonMessage);
      const cmd = String(obj['cmd']);
      if (cmd.includes('DANMU_MSG')) {
        const info = obj['info'];
        if (info && info.length !== 0) {
          const message = String(info[1]);
          const color = asT<number>(info[0]?.[3]) ?? 0;
          if (info[2] && info[2].length !== 0) {
            const username = String(info[2][1]);
            const liveMsg = new LiveMessage(
              LiveMessageType.Chat, username, message,
              color === 0 ? LiveMessageColor.white : LiveMessageColor.numberToColor(color),
            );
            this.onMessage?.(liveMsg);
          }
        }
      } else if (cmd === 'SUPER_CHAT_MESSAGE') {
        if (!obj['data']) return;
        const d = obj['data'];
        const sc = new LiveSuperChatMessage(
          String(d['user_info']['uname']),
          `${d['user_info']['face']}@200w.jpg`,
          String(d['message']),
          d['price'],
          new Date(d['start_time'] * 1000),
          new Date(d['end_time'] * 1000),
          String(d['background_color']),
          String(d['background_bottom_color']),
        );
        this.onMessage?.(new LiveMessage(LiveMessageType.SuperChat, 'SUPER_CHAT_MESSAGE', 'SUPER_CHAT_MESSAGE', LiveMessageColor.white, sc));
      }
    } catch (e) {
      CoreLog.error(e);
    }
  }
}
