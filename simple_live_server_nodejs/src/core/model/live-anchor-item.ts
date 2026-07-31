/**
 * 主播列表项模型
 *
 * 对应 Dart 版 simple_live_core/lib/src/model/live_anchor_item.dart
 */

export class LiveAnchorItem {
  constructor(
    public readonly roomId: string,
    public readonly userName: string,
    public readonly avatar: string,
    public readonly liveStatus: boolean,
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      roomId: this.roomId,
      userName: this.userName,
      avatar: this.avatar,
      liveStatus: this.liveStatus,
    };
  }
}
