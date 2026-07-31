/**
 * 虎牙弹幕 Tars 模型
 *
 * 对应 Dart 版 simple_live_core/lib/src/model/tars/huya_danmaku.dart
 */

import { TarsStruct } from '../tars-struct.js';
import { TarsInputStream, TarsOutputStream } from '../tars-codec.js';

export class HYPushMessage extends TarsStruct {
  pushType = 0;
  uri = 0;
  msg: Uint8Array = new Uint8Array();
  protocolType = 0;

  readFrom(is_: TarsInputStream): void {
    this.pushType = is_.readInt(0, false);
    this.uri = is_.readInt(1, false);
    this.msg = is_.readBytes(2, false);
    this.protocolType = is_.readInt(3, false);
  }
  writeTo(_os: TarsOutputStream): void {}
}

export class HYSender extends TarsStruct {
  uid = 0;
  lMid = 0;
  nickName = '';
  gender = 0;

  readFrom(is_: TarsInputStream): void {
    this.uid = is_.readInt(0, false);
    this.lMid = is_.readInt(1, false);
    this.nickName = is_.readString(2, false);
    this.gender = is_.readInt(3, false);
  }
  writeTo(_os: TarsOutputStream): void {}
}

export class HYBulletFormat extends TarsStruct {
  fontColor = 0;
  fontSize = 4;
  textSpeed = 0;
  transitionType = 1;

  readFrom(is_: TarsInputStream): void {
    this.fontColor = is_.readInt(0, false);
    this.fontSize = is_.readInt(1, false);
    this.textSpeed = is_.readInt(2, false);
    this.transitionType = is_.readInt(3, false);
  }
  writeTo(_os: TarsOutputStream): void {}
}

export class HYMessage extends TarsStruct {
  userInfo = new HYSender();
  content = '';
  bulletFormat = new HYBulletFormat();

  readFrom(is_: TarsInputStream): void {
    this.userInfo = is_.readStruct(new HYSender(), 0, false);
    this.content = is_.readString(3, false);
    this.bulletFormat = is_.readStruct(new HYBulletFormat(), 6, false);
  }
  writeTo(_os: TarsOutputStream): void {}
}
