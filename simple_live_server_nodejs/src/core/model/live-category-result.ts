/**
 * 分类房间列表结果模型
 *
 * 对应 Dart 版 simple_live_core/lib/src/model/live_category_result.dart
 */

import { LiveRoomItem } from './live-room-item.js';

export class LiveCategoryResult {
  constructor(
    public readonly hasMore: boolean,
    public readonly items: LiveRoomItem[],
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      hasMore: this.hasMore,
      items: this.items.map((item) => item.toJSON()),
    };
  }
}
