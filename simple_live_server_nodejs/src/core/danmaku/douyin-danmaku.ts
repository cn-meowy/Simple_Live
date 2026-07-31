/**
 * 抖音弹幕协议实现
 *
 * 对应 Dart 版 simple_live_core/lib/src/danmaku/douyin_danmaku.dart
 * Protobuf + Gzip 压缩，通过 WebSocket 连接
 */

import { LiveDanmaku, MessageHandler, CloseHandler, ReadyHandler } from '../interface/live-danmaku.js';
import { LiveMessage, LiveMessageType, LiveMessageColor } from '../model/live-message.js';
import { WebSocketUtils } from '../common/web-socket-util.js';
import { CoreLog } from '../common/core-log.js';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import protobuf from 'protobufjs';
import { DouyinSign } from '../scripts/douyin-sign.js';
import { DouyinDanmakuArgs } from '../sites/douyin-site.js';

const kDefaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.97 Safari/537.36 Core/1.116.567.400 QQBrowser/19.7.6764.400';

// 懒加载 protobuf 模型
let protoRoot: protobuf.Root | null = null;
let PushFrameType: protobuf.Type | null = null;
let ResponseType: protobuf.Type | null = null;
let ChatMessageType: protobuf.Type | null = null;
let RoomUserSeqMessageType: protobuf.Type | null = null;

async function loadProto(): Promise<protobuf.Root> {
  if (protoRoot) return protoRoot;
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const protoPath = path.resolve(currentDir, '../proto/douyin.proto');
  const root = await protobuf.load(protoPath);
  protoRoot = root;
  PushFrameType = root.lookupType('PushFrame');
  ResponseType = root.lookupType('Response');
  ChatMessageType = root.lookupType('ChatMessage');
  RoomUserSeqMessageType = root.lookupType('RoomUserSeqMessage');
  return root;
}

export class DouyinDanmaku extends LiveDanmaku {
  heartbeatTime = 10 * 1000;

  onMessage: MessageHandler | null = null;
  onClose: CloseHandler | null = null;
  onReady: ReadyHandler | null = null;

  private readonly serverUrl = 'wss://webcast3-ws-web-lq.douyin.com/webcast/im/push/v2/';
  private danmakuArgs!: DouyinDanmakuArgs;
  private wsUtils: WebSocketUtils | null = null;

  async start(args: unknown): Promise<void> {
    this.danmakuArgs = args as DouyinDanmakuArgs;
    await loadProto();

    const ts = Date.now();
    const url = new URL(this.serverUrl);
    url.search = new URLSearchParams({
      app_name: 'douyin_web', version_code: '180800', webcast_sdk_version: '1.3.0',
      update_version_code: '1.3.0', compress: 'gzip',
      cursor: `h-1_t-${ts}_r-1_d-1_u-1`, host: 'https://live.douyin.com',
      aid: '6383', live_id: '1', did_rule: '3', debug: 'false',
      maxCacheMessageNumber: '20', endpoint: 'live_pc', support_wrds: '1',
      im_path: '/webcast/im/fetch/', user_unique_id: this.danmakuArgs.userId,
      device_platform: 'web', cookie_enabled: 'true', screen_width: '1920',
      screen_height: '1080', browser_language: 'zh-CN', browser_platform: 'Win32',
      browser_name: 'Mozilla', browser_version: kDefaultUserAgent.replace('Mozilla/', ''),
      browser_online: 'true', tz_name: 'Asia/Shanghai', identity: 'audience',
      room_id: this.danmakuArgs.roomId, heartbeatDuration: '0',
    }).toString();

    const sign = await DouyinSign.getSignature(this.danmakuArgs.roomId, this.danmakuArgs.userId);
    const wsUrl = `${url.toString()}&signature=${sign}`;
    const backupUrl = wsUrl.replace('webcast3-ws-web-lq', 'webcast5-ws-web-lf');

    this.wsUtils = new WebSocketUtils({
      url: wsUrl,
      backupUrl,
      headers: {
        'User-Agent': kDefaultUserAgent,
        Cookie: this.danmakuArgs.cookie,
        Origin: 'https://live.douyin.com',
      },
      heartBeatTime: this.heartbeatTime,
      onMessage: (e) => this.decodeMessage(e),
      onReady: () => { this.onReady?.(); this.joinRoom(); },
      onHeartBeat: () => this.heartbeat(),
      onReconnect: () => this.onClose?.('与服务器断开连接，正在尝试重连'),
      onClose: (e) => this.onClose?.(`服务器连接失败${e}`),
    });
    this.wsUtils.connect();
  }

  heartbeat(): void {
    if (!PushFrameType) return;
    const obj = PushFrameType.create({ payloadType: 'hb' });
    this.wsUtils?.sendMessage(Buffer.from(PushFrameType.encode(obj).finish()));
  }

  private joinRoom(): void {
    if (!PushFrameType) return;
    const obj = PushFrameType.create({ payloadType: 'hb' });
    this.wsUtils?.sendMessage(Buffer.from(PushFrameType.encode(obj).finish()));
  }

  private decodeMessage(data: Buffer): void {
    try {
      if (!PushFrameType || !ResponseType) return;
      const wssPackage = PushFrameType.decode(new Uint8Array(data)).toJSON() as any;
      const logId = wssPackage.logId;
      // payload 是 bytes 字段，protobufjs 返回 uint8array
      const payload = (PushFrameType.decode(new Uint8Array(data)) as any).payload;
      if (!payload) return;
      const decompressed = gunzipSync(Buffer.from(payload));
      const payloadPackage = ResponseType.decode(new Uint8Array(decompressed)).toJSON() as any;
      if (payloadPackage.needAck) {
        this.sendAck(logId, payloadPackage.internalExt ?? '');
      }
      const messagesList = payloadPackage.messagesList ?? payloadPackage.messagesList ?? [];
      for (const msg of messagesList) {
        if (msg.method === 'WebcastChatMessage') {
          this.unPackWebcastChatMessage(msg.payload);
        } else if (msg.method === 'WebcastRoomUserSeqMessage') {
          this.unPackWebcastRoomUserSeqMessage(msg.payload);
        }
      }
    } catch (e) {
      CoreLog.error(e);
    }
  }

  private unPackWebcastChatMessage(payload: Uint8Array | string): void {
    if (!ChatMessageType) return;
    const buf = typeof payload === 'string' ? Buffer.from(payload, 'base64') : Buffer.from(payload);
    const chatMessage = ChatMessageType.decode(new Uint8Array(buf)).toJSON() as any;
    this.onMessage?.(new LiveMessage(
      LiveMessageType.Chat,
      chatMessage.user?.nickName ?? '',
      chatMessage.content ?? '',
      LiveMessageColor.white,
    ));
  }

  private unPackWebcastRoomUserSeqMessage(payload: Uint8Array | string): void {
    if (!RoomUserSeqMessageType) return;
    const buf = typeof payload === 'string' ? Buffer.from(payload, 'base64') : Buffer.from(payload);
    const roomUserSeqMessage = RoomUserSeqMessageType.decode(new Uint8Array(buf)).toJSON() as any;
    this.onMessage?.(new LiveMessage(
      LiveMessageType.Online, '', '', LiveMessageColor.white,
      Number(roomUserSeqMessage.totalUser ?? 0),
    ));
  }

  private sendAck(logId: unknown, internalExt: string): void {
    if (!PushFrameType) return;
    const obj = PushFrameType.create({ payloadType: 'ack', logId, internalExt });
    this.wsUtils?.sendMessage(Buffer.from(PushFrameType.encode(obj).finish()));
  }

  async stop(): Promise<void> {
    this.onMessage = null;
    this.onClose = null;
    this.wsUtils?.close();
  }
}
