/**
 * 虎牙弹幕协议实现
 *
 * 对应 Dart 版 simple_live_core/lib/src/danmaku/huya_danmaku.dart
 * Tars 二进制协议，通过 WebSocket 连接
 */

import { LiveDanmaku, MessageHandler, CloseHandler, ReadyHandler } from '../interface/live-danmaku.js';
import { LiveMessage, LiveMessageType, LiveMessageColor } from '../model/live-message.js';
import { WebSocketUtils } from '../common/web-socket-util.js';
import { CoreLog } from '../common/core-log.js';
import { TarsOutputStream, TarsInputStream } from '../tars/tars-codec.js';
import { HYPushMessage, HYMessage } from '../tars/models/huya-danmaku-models.js';
import { HuyaDanmakuArgs } from '../sites/huya-site.js';

export class HuyaDanmaku extends LiveDanmaku {
  heartbeatTime = 60 * 1000;

  onMessage: MessageHandler | null = null;
  onClose: CloseHandler | null = null;
  onReady: ReadyHandler | null = null;

  private readonly serverUrl = 'wss://cdnws.api.huya.com';
  private readonly heartbeatData = Buffer.from('ABQdAAwsNgBM', 'base64');
  private wsUtils: WebSocketUtils | null = null;
  private danmakuArgs!: HuyaDanmakuArgs;

  async start(args: unknown): Promise<void> {
    this.danmakuArgs = args as HuyaDanmakuArgs;
    this.wsUtils = new WebSocketUtils({
      url: this.serverUrl,
      heartBeatTime: this.heartbeatTime,
      onMessage: (e) => this.decodeMessage(e),
      onReady: () => { this.onReady?.(); this.joinRoom(); },
      onHeartBeat: () => this.heartbeat(),
      onReconnect: () => this.onClose?.('与服务器断开连接，正在尝试重连'),
      onClose: (e) => this.onClose?.(`服务器连接失败${e}`),
    });
    this.wsUtils.connect();
  }

  private joinRoom(): void {
    const joinData = this.getJoinData(this.danmakuArgs.ayyuid, this.danmakuArgs.topSid, this.danmakuArgs.topSid);
    this.wsUtils?.sendMessage(joinData);
  }

  private getJoinData(ayyuid: number, tid: number, sid: number): Buffer {
    try {
      const oos = new TarsOutputStream();
      oos.writeInt(ayyuid, 0);
      oos.writeBool(true, 1);
      oos.writeString('', 2);
      oos.writeString('', 3);
      oos.writeInt(tid, 4);
      oos.writeInt(sid, 5);
      oos.writeInt(0, 6);
      oos.writeInt(0, 7);

      const wscmd = new TarsOutputStream();
      wscmd.writeInt(1, 0);
      wscmd.writeBytes(oos.toUint8Array(), 1);
      return Buffer.from(wscmd.toUint8Array());
    } catch (e) {
      CoreLog.error(e);
      return Buffer.alloc(0);
    }
  }

  heartbeat(): void {
    this.wsUtils?.sendMessage(this.heartbeatData);
  }

  async stop(): Promise<void> {
    this.onMessage = null;
    this.onClose = null;
    this.wsUtils?.close();
  }

  private decodeMessage(data: Buffer): void {
    try {
      let stream = new TarsInputStream(data);
      const type = stream.readInt(0, false);
      if (type === 7) {
        const innerBytes = stream.readBytes(1, false);
        stream = new TarsInputStream(innerBytes);
        const wsPushMessage = new HYPushMessage();
        stream.readStruct(wsPushMessage, 0, false);
        if (wsPushMessage.uri === 1400) {
          // 弹幕消息
          const messageNotice = new HYMessage();
          new TarsInputStream(wsPushMessage.msg).readStruct(messageNotice, 0, false);
          const uname = messageNotice.userInfo.nickName;
          const content = messageNotice.content;
          const color = messageNotice.bulletFormat.fontColor;
          this.onMessage?.(new LiveMessage(
            LiveMessageType.Chat, uname, content,
            color <= 0 ? LiveMessageColor.white : LiveMessageColor.numberToColor(color),
          ));
        } else if (wsPushMessage.uri === 8006) {
          // 在线人数
          const s = new TarsInputStream(wsPushMessage.msg);
          const online = s.readInt(0, false);
          this.onMessage?.(new LiveMessage(
            LiveMessageType.Online, '', '', LiveMessageColor.white, online,
          ));
        }
      }
    } catch (e) {
      CoreLog.error(e);
    }
  }
}
