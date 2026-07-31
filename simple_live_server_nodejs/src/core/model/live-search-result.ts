/**
 * 搜索结果模型
 *
 * 对应 Dart 版 simple_live_core/lib/src/model/live_search_result.dart
 */

import { LiveRoomItem } from './live-room-item.js';
import { LiveAnchorItem } from './live-anchor-item.js';

export class LiveSearchRoomResult {
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

export class LiveSearchAnchorResult {
  constructor(
    public readonly hasMore: boolean,
    public readonly items: LiveAnchorItem[],
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      hasMore: this.hasMore,
      items: this.items.map((item) => item.toJSON()),
    };
  }
}
