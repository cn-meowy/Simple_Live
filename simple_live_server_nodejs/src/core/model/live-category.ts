/**
 * 分类模型
 *
 * 对应 Dart 版 simple_live_core/lib/src/model/live_category.dart
 */

export class LiveSubCategory {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly parentId: string,
    public readonly pic: string = '',
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      parentId: this.parentId,
      pic: this.pic,
    };
  }
}

export class LiveCategory {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly children: LiveSubCategory[] = [],
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      children: this.children.map((c) => c.toJSON()),
    };
  }
}
