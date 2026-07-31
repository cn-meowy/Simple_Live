/**
 * 斗鱼弹幕协议实现
 *
 * 对应 Dart 版 simple_live_core/lib/src/danmaku/douyu_danmaku.dart
 * STT 文本协议，小端序二进制帧
 */

import { LiveDanmaku, MessageHandler, CloseHandler, ReadyHandler } from '../interface/live-danmaku.js';
import { LiveMessage, LiveMessageType, LiveMessageColor } from '../model/live-message.js';
import { WebSocketUtils } from '../common/web-socket-util.js';
import { CoreLog } from '../common/core-log.js';

export class DouyuDanmaku extends LiveDanmaku {
  heartbeatTime = 45 * 1000;

  onMessage: MessageHandler | null = null;
  onClose: CloseHandler | null = null;
  onReady: ReadyHandler | null = null;

  private readonly serverUrl = 'wss://danmuproxy.douyu.com:8506';
  private wsUtils: WebSocketUtils | null = null;

  async start(args: unknown): Promise<void> {
    this.wsUtils = new WebSocketUtils({
      url: this.serverUrl,
      heartBeatTime: this.heartbeatTime,
      onMessage: (e) => this.decodeMessage(e),
      onReady: () => { this.onReady?.(); this.joinRoom(args as string); },
      onHeartBeat: () => this.heartbeat(),
      onReconnect: () => this.onClose?.('与服务器断开连接，正在尝试重连'),
      onClose: (e) => this.onClose?.(`服务器连接失败${e}`),
    });
    this.wsUtils.connect();
  }

  private joinRoom(roomId: string): void {
    this.wsUtils?.sendMessage(this.serializeDouyu(`type@=loginreq/roomid@=${roomId}/`));
    this.wsUtils?.sendMessage(this.serializeDouyu(`type@=joingroup/rid@=${roomId}/gid@=-9999/`));
  }

  heartbeat(): void {
    this.wsUtils?.sendMessage(this.serializeDouyu('type@=mrkl/'));
  }

  async stop(): Promise<void> {
    this.onMessage = null;
    this.onClose = null;
    this.wsUtils?.close();
  }

  private serializeDouyu(body: string): Buffer {
    try {
      const CLIENT_SEND_TO_SERVER = 689;
      const bodyBytes = Buffer.from(body, 'utf-8');
      const totalLen = 4 + 4 + bodyBytes.length + 1;
      const buf = Buffer.alloc(totalLen + 8); // 8 bytes header (2x int32)
      let offset = 0;
      buf.writeInt32LE(totalLen, offset); offset += 4; // fullMsgLength
      buf.writeInt32LE(totalLen, offset); offset += 4; // fullMsgLength2
      buf.writeInt16LE(CLIENT_SEND_TO_SERVER, offset); offset += 2; // packType
      buf.writeInt8(0, offset); offset += 1; // encrypted
      buf.writeInt8(0, offset); offset += 1; // reserved
      bodyBytes.copy(buf, offset); offset += bodyBytes.length;
      buf.writeInt8(0, offset); // trailing 0
      return buf;
    } catch (e) {
      CoreLog.error(e);
      return Buffer.alloc(0);
    }
  }

  private deserializeDouyu(buffer: Buffer): string | null {
    try {
      if (buffer.length < 12) return null;
      const fullMsgLength = buffer.readInt32LE(0);
      // buffer.readInt32LE(4); // fullMsgLength2 (ignored)
      const bodyLength = fullMsgLength - 9;
      let offset = 8; // skip two int32s
      offset += 2; // packType (short)
      offset += 1; // encrypted (byte)
      offset += 1; // reserved (byte)
      const body = buffer.subarray(offset, offset + bodyLength);
      return body.toString('utf-8');
    } catch (e) {
      CoreLog.error(e);
      return null;
    }
  }

  private decodeMessage(data: Buffer): void {
    try {
      const result = this.deserializeDouyu(data);
      if (!result) return;
      const jsonData = this.sttToJObject(result);
      const type = jsonData?.['type']?.toString();
      if (type === 'chatmsg') {
        if (jsonData['dms'] == null) return; // 屏蔽阴间弹幕
        const col = parseInt(jsonData['col']?.toString() ?? '0', 10) || 0;
        const liveMsg = new LiveMessage(
          LiveMessageType.Chat,
          String(jsonData['nn']),
          String(jsonData['txt']),
          this.getColor(col),
        );
        this.onMessage?.(liveMsg);
      }
    } catch (e) {
      CoreLog.error(e);
    }
  }

  /** 解析 STT（斗鱼自定义文本协议）为 JS 对象/数组 */
  private sttToJObject(str: string): any {
    if (str.includes('//')) {
      const result: any[] = [];
      for (const field of str.split('//')) {
        if (field) result.push(this.sttToJObject(field));
      }
      return result;
    }
    if (str.includes('@=')) {
      const result: Record<string, any> = {};
      for (const field of str.split('/')) {
        if (!field) continue;
        const tokens = field.split('@=');
        const k = tokens[0];
        const v = this.unscapeSlashAt(tokens[1]);
        result[k] = this.sttToJObject(v);
      }
      return result;
    } else if (str.includes('@A=')) {
      return this.sttToJObject(this.unscapeSlashAt(str));
    } else {
      return this.unscapeSlashAt(str);
    }
  }

  private unscapeSlashAt(str: string): string {
    return str.replaceAll('@S', '/').replaceAll('@A', '@');
  }

  private getColor(type: number): LiveMessageColor {
    switch (type) {
      case 1: return new LiveMessageColor(255, 0, 0);
      case 2: return new LiveMessageColor(30, 135, 240);
      case 3: return new LiveMessageColor(122, 200, 75);
      case 4: return new LiveMessageColor(255, 127, 0);
      case 5: return new LiveMessageColor(155, 57, 244);
      case 6: return new LiveMessageColor(255, 105, 180);
      default: return LiveMessageColor.white;
    }
  }
}
