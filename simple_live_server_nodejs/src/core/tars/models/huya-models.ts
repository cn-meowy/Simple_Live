/**
 * 虎牙 Tars 数据模型
 *
 * 对应 Dart 版 simple_live_core/lib/src/model/tars/ 下的模型
 * - HuyaUserId: 用户标识
 * - GetCdnTokenExReq: 获取 CDN Token 请求
 * - GetCdnTokenExResp: 获取 CDN Token 响应
 */

import { TarsStruct } from '../tars-struct.js';
import { TarsOutputStream, TarsInputStream } from '../tars-codec.js';

/**
 * 虎牙用户 ID
 *
 * 对应 Dart 版 HuyaUserId
 */
export class HuyaUserId extends TarsStruct {
  lUid = 0; // tag 0
  sGuid = ''; // tag 1
  sToken = ''; // tag 2
  sHuYaUA = ''; // tag 3
  sCookie = ''; // tag 4
  iTokenType = 0; // tag 5
  sDeviceInfo = ''; // tag 6
  sQIMEI = ''; // tag 7

  writeTo(os: TarsOutputStream): void {
    os.writeInt(this.lUid, 0);
    os.writeString(this.sGuid, 1);
    os.writeString(this.sToken, 2);
    os.writeString(this.sHuYaUA, 3);
    os.writeString(this.sCookie, 4);
    os.writeInt(this.iTokenType, 5);
    os.writeString(this.sDeviceInfo, 6);
    os.writeString(this.sQIMEI, 7);
  }

  readFrom(is_: TarsInputStream): void {
    this.lUid = is_.readInt(0, false);
    this.sGuid = is_.readString(1, false);
    this.sToken = is_.readString(2, false);
    this.sHuYaUA = is_.readString(3, false);
    this.sCookie = is_.readString(4, false);
    this.iTokenType = is_.readInt(5, false);
    this.sDeviceInfo = is_.readString(6, false);
    this.sQIMEI = is_.readString(7, false);
  }
}

/**
 * 获取 CDN Token 扩展请求
 *
 * 对应 Dart 版 GetCdnTokenExReq
 */
export class GetCdnTokenExReq extends TarsStruct {
  sFlvUrl = ''; // tag 0
  sStreamName = ''; // tag 1
  iLoopTime = 0; // tag 2
  tId = new HuyaUserId(); // tag 3
  iAppId = 66; // tag 4

  writeTo(os: TarsOutputStream): void {
    os.writeString(this.sFlvUrl, 0);
    os.writeString(this.sStreamName, 1);
    os.writeInt(this.iLoopTime, 2);
    os.writeStruct(this.tId, 3);
    os.writeInt(this.iAppId, 4);
  }

  readFrom(is_: TarsInputStream): void {
    this.sFlvUrl = is_.readString(0, false);
    this.sStreamName = is_.readString(1, false);
    this.iLoopTime = is_.readInt(2, false);
    this.tId = is_.readStruct(new HuyaUserId(), 3, false);
    this.iAppId = is_.readInt(4, false);
  }
}

/**
 * 获取 CDN Token 扩展响应
 *
 * 对应 Dart 版 GetCdnTokenExResp
 */
export class GetCdnTokenExResp extends TarsStruct {
  sFlvToken = ''; // tag 0
  iExpireTime = 0; // tag 1

  writeTo(os: TarsOutputStream): void {
    os.writeString(this.sFlvToken, 0);
    os.writeInt(this.iExpireTime, 1);
  }

  readFrom(is_: TarsInputStream): void {
    this.sFlvToken = is_.readString(0, false);
    this.iExpireTime = is_.readInt(1, false);
  }
}
