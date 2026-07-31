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
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      roomId: this.roomId,
      title: this.title,
      cover: this.cover,
      userName: this.userName,
      online: this.online,
    };
  }
}
