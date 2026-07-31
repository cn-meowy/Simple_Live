/**
 * WebSocket 工具类
 *
 * 对应 Dart 版 simple_live_core/lib/src/common/web_socket_util.dart
 * 基于 ws 库，支持心跳、自动重连、备用地址切换。
 */

import WebSocket, { RawData } from 'ws';

export enum SocketStatus {
  Connected = 'connected',
  Failed = 'failed',
  Closed = 'closed',
}

export type MessageHandler = (data: Buffer) => void;
export type CloseHandler = (msg: string) => void;
export type ReconnectHandler = () => void;
export type ReadyHandler = () => void;
export type HeartBeatHandler = () => void;

export interface WebSocketUtilsOptions {
  url: string;
  heartBeatTime: number;
  headers?: Record<string, string>;
  backupUrl?: string;
  onMessage?: MessageHandler;
  onClose?: CloseHandler;
  onReconnect?: ReconnectHandler;
  onReady?: ReadyHandler;
  onHeartBeat?: HeartBeatHandler;
}

export class WebSocketUtils {
  status: SocketStatus = SocketStatus.Closed;

  readonly url: string;
  readonly backupUrl?: string;
  readonly heartBeatTime: number;
  readonly headers?: Record<string, string>;

  onMessage?: MessageHandler;
  onClose?: CloseHandler;
  onReconnect?: ReconnectHandler;
  onReady?: ReadyHandler;
  onHeartBeat?: HeartBeatHandler;

  private ws: WebSocket | null = null;
  private heartBeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectTime = 0;
  private readonly maxReconnectTime = 5;

  constructor(options: WebSocketUtilsOptions) {
    this.url = options.url;
    this.heartBeatTime = options.heartBeatTime;
    this.headers = options.headers;
    this.backupUrl = options.backupUrl;
    this.onMessage = options.onMessage;
    this.onClose = options.onClose;
    this.onReconnect = options.onReconnect;
    this.onReady = options.onReady;
    this.onHeartBeat = options.onHeartBeat;
  }

  /** 连接 */
  connect(retry = false): void {
    this.close();

    let wsUrl = this.url;
    if (this.backupUrl && this.backupUrl !== '' && retry) {
      wsUrl = this.backupUrl;
    }

    try {
      this.ws = new WebSocket(wsUrl, {
        headers: this.headers,
        handshakeTimeout: 10000,
      });

      this.ws.on('open', () => this.onOpen());
      this.ws.on('message', (data: RawData) => this.receiveMessage(data));
      this.ws.on('error', (err: Error) => this.onError(err));
      this.ws.on('close', () => this.onDone());
    } catch (e) {
      if (!retry) {
        this.connect(true);
        return;
      }
      this.onError(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /** 连接完成 */
  private onOpen(): void {
    this.status = SocketStatus.Connected;
    this.onReady?.call(null);
    this.initHeartBeat();
  }

  private initHeartBeat(): void {
    this.clearHeartBeatTimer();
    this.heartBeatTimer = setInterval(() => {
      this.onHeartBeat?.call(null);
    }, this.heartBeatTime);
  }

  private clearHeartBeatTimer(): void {
    if (this.heartBeatTimer) {
      clearInterval(this.heartBeatTimer);
      this.heartBeatTimer = null;
    }
  }

  private receiveMessage(data: RawData): void {
    // 接收到一条信息才算重连成功
    this.reconnectTime = 0;
    if (this.onMessage) {
      // RawData 可能是 Buffer 或 Buffer[]
      const buf = Array.isArray(data) ? Buffer.concat(data) : (data as Buffer);
      this.onMessage(buf);
    }
  }

  private onError(err: Error): void {
    this.status = SocketStatus.Failed;
    this.onClose?.call(null, err.message);
  }

  private onDone(): void {
    if (this.status === SocketStatus.Closed) {
      return;
    }
    this.onReconnect?.call(null);
    this.reconnect();
  }

  /** 发送消息 */
  sendMessage(message: string | Buffer | Uint8Array): void {
    if (this.status === SocketStatus.Connected && this.ws) {
      if (Buffer.isBuffer(message) || message instanceof Uint8Array) {
        this.ws.send(message);
      } else {
        this.ws.send(message);
      }
    }
  }

  /** 关闭连接 */
  close(): void {
    this.status = SocketStatus.Closed;

    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.clearHeartBeatTimer();

    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {
        // 忽略关闭错误
      }
      this.ws = null;
    }
  }

  /** 重连 */
  private reconnect(): void {
    this.status = SocketStatus.Closed;
    if (this.reconnectTime < this.maxReconnectTime) {
      this.reconnectTime++;
      if (!this.reconnectTimer) {
        this.reconnectTimer = setInterval(() => {
          this.connect();
        }, 5000);
      }
    } else {
      this.onClose?.call(null, '重连超过最大次数，与服务器断开连接');
      if (this.reconnectTimer) {
        clearInterval(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.close();
    }
  }
}
