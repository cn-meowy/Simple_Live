/**
 * 本地房间数据模型
 *
 * 用于 local 虚拟平台，描述一个本地视频文件对应的"房间"。
 * filePath 字段仅服务端内部使用，不通过 API 返回给客户端。
 */

export class LocalRoomData {
  constructor(
    /** 房间 ID（唯一，建议用文件名） */
    public readonly roomId: string,
    /** 房间标题（默认为文件名） */
    public readonly title: string,
    /** 封面 URL（本地无封面，默认空） */
    public readonly cover: string,
    /** 主播名（固定"本地直播"） */
    public readonly userName: string,
    /** 在线人数（固定值） */
    public readonly online: number,
    /** 视频文件在服务器上的绝对路径（内部字段） */
    public readonly filePath: string,
  ) {}

  /**
   * 从 JSON 对象构建 LocalRoomData
   */
  static fromJson(json: Record<string, unknown>): LocalRoomData {
    return new LocalRoomData(
      String(json['roomId'] ?? ''),
      String(json['title'] ?? ''),
      String(json['cover'] ?? ''),
      String(json['userName'] ?? '本地直播'),
      typeof json['online'] === 'number' ? json['online'] : Number(json['online']) || 999,
      String(json['filePath'] ?? ''),
    );
  }

  /**
   * 转为 JSON 对象（用于序列化存储）
   */
  toJSON(): Record<string, unknown> {
    return {
      roomId: this.roomId,
      title: this.title,
      cover: this.cover,
      userName: this.userName,
      online: this.online,
      filePath: this.filePath,
    };
  }
}
