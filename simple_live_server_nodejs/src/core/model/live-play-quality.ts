/**
 * 清晰度模型
 *
 * 对应 Dart 版 simple_live_core/lib/src/model/live_play_quality.dart
 */

/**
 * 斗鱼播放数据（码率 + CDN 列表）
 */
export class DouyuPlayData {
  constructor(
    public readonly rate: number,
    public readonly cdns: string[],
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      rate: this.rate,
      cdns: this.cdns,
    };
  }
}

/**
 * 清晰度信息
 */
export class LivePlayQuality {
  constructor(
    /** 清晰度名称 */
    public readonly quality: string,
    /** 清晰度信息（动态类型，各平台不同） */
    public readonly data: unknown,
    /** 排序值 */
    public readonly sort: number = 0,
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      quality: this.quality,
      data: this.data,
      sort: this.sort,
    };
  }
}
