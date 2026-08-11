/**
 * 房间列表项模型
 *
 * 对应 Dart 版 simple_live_core/lib/src/model/live_room_item.dart
 */

export class LiveRoomItem {
  constructor(
    public readonly roomId: string,
    public readonly title: string,
    public readonly cover: string,
    public readonly userName: string,
    public readonly online: number,
    /** 类型图标 key（可选，仅 local 平台填充；为空时不输出以保持其它平台响应结构不变） */
    public readonly typeIcon?: string,
  ) {}

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      roomId: this.roomId,
      title: this.title,
      cover: this.cover,
      userName: this.userName,
      online: this.online,
    };
    if (this.typeIcon) {
      result['typeIcon'] = this.typeIcon;
    }
    return result;
  }
}
