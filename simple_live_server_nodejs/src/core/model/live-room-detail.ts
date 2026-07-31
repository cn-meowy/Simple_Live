/**
 * 房间详情模型
 *
 * 对应 Dart 版 simple_live_core/lib/src/model/live_room_detail.dart
 */

export class LiveRoomDetail {
  constructor(
    /** 房间ID */
    public readonly roomId: string,
    /** 房间标题 */
    public readonly title: string,
    /** 封面 */
    public readonly cover: string,
    /** 主播名 */
    public readonly userName: string,
    /** 主播头像 */
    public readonly userAvatar: string,
    /** 在线人数 */
    public readonly online: number,
    /** 是否直播中 */
    public readonly status: boolean,
    /** 直播间URL */
    public readonly url: string,
    /** 附加信息（各平台不同，动态类型） */
    public readonly data?: unknown,
    /** 弹幕附加信息（各平台不同，动态类型） */
    public readonly danmakuData?: unknown,
    /** 简介 */
    public readonly introduction?: string,
    /** 公告 */
    public readonly notice?: string,
    /** 是否录播 */
    public readonly isRecord: boolean = false,
    /** 显示时间 */
    public readonly showTime?: string,
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      roomId: this.roomId,
      title: this.title,
      cover: this.cover,
      userName: this.userName,
      userAvatar: this.userAvatar,
      online: this.online,
      introduction: this.introduction ?? '',
      notice: this.notice ?? '',
      status: this.status,
      data: this.data !== undefined ? this.data : null,
      danmakuData: this.danmakuData !== undefined ? this.danmakuData : null,
      url: this.url,
      isRecord: this.isRecord,
      showTime: this.showTime ?? '',
    };
  }
}
