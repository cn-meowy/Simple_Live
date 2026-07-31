/**
 * 弹幕消息模型
 *
 * 对应 Dart 版 simple_live_core/lib/src/model/live_message.dart
 */

export enum LiveMessageType {
  /** 聊天 */
  Chat = 'chat',
  /** 礼物，暂不支持 */
  Gift = 'gift',
  /** 在线人数 */
  Online = 'online',
  /** 醒目留言 */
  SuperChat = 'superChat',
}

/**
 * 弹幕颜色（RGB）
 */
export class LiveMessageColor {
  constructor(
    public readonly r: number,
    public readonly g: number,
    public readonly b: number,
  ) {}

  static get white(): LiveMessageColor {
    return new LiveMessageColor(255, 255, 255);
  }

  /** 整数颜色值转 LiveMessageColor */
  static numberToColor(intColor: number): LiveMessageColor {
    let obj = intColor.toString(16);
    let color = LiveMessageColor.white;

    if (obj.length === 4) {
      obj = `00${obj}`;
    }

    if (obj.length === 6) {
      const r = parseInt(obj.substring(0, 2), 16);
      const g = parseInt(obj.substring(2, 4), 16);
      const b = parseInt(obj.substring(4, 6), 16);
      color = new LiveMessageColor(r, g, b);
    }

    if (obj.length === 8) {
      const r = parseInt(obj.substring(2, 4), 16);
      const g = parseInt(obj.substring(4, 6), 16);
      const b = parseInt(obj.substring(6, 8), 16);
      color = new LiveMessageColor(r, g, b);
    }

    return color;
  }

  /** 转为 #rrggbb 字符串 */
  toString(): string {
    const toHex = (n: number): string => n.toString(16).padStart(2, '0');
    return `#${toHex(this.r)}${toHex(this.g)}${toHex(this.b)}`;
  }
}

/**
 * 弹幕消息
 */
export class LiveMessage {
  constructor(
    public readonly type: LiveMessageType,
    public readonly userName: string,
    public readonly message: string,
    public readonly color: LiveMessageColor,
    public readonly data?: unknown,
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      userName: this.userName,
      message: this.message,
      data: this.data !== undefined ? String(this.data) : undefined,
      color: this.color.toString(),
    };
  }
}

/**
 * 醒目留言（SuperChat）
 */
export class LiveSuperChatMessage {
  constructor(
    public readonly userName: string,
    public readonly face: string,
    public readonly message: string,
    public readonly price: number,
    public readonly startTime: Date,
    public readonly endTime: Date,
    public readonly backgroundColor: string,
    public readonly backgroundBottomColor: string,
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      userName: this.userName,
      face: this.face,
      message: this.message,
      price: this.price,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime.toISOString(),
      backgroundColor: this.backgroundColor,
      backgroundBottomColor: this.backgroundBottomColor,
    };
  }
}
