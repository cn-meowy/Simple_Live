/**
 * 播放直链模型
 *
 * 对应 Dart 版 simple_live_core/lib/src/model/live_play_url.dart
 */

export class LivePlayUrl {
  constructor(
    public readonly urls: string[] = [],
    public readonly headers: Record<string, string> = {},
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      urls: this.urls,
      headers: this.headers,
    };
  }
}
