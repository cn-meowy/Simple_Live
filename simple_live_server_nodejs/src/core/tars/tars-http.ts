/**
 * Tars HTTP 客户端（TUP3 协议封包/解包）
 *
 * 对应 Dart 版 tars_dart/lib/net/base_tars_http.dart
 *
 * 封包流程（encode）：
 * 1. 构建 RequestPacket（含 servantName、funcName、sBuffer）
 * 2. sBuffer = UniAttribute.encode() = TarsOutputStream.write(Map<string, Uint8Array>)
 *    其中 Map 的 key 是参数名（如 "tReq"），value 是 TarsStruct.toByteArray()
 * 3. RequestPacket 自身用 TarsOutputStream 序列化为 body
 * 4. 最终包 = 4字节长度(大端) + body
 *
 * 解包流程（decode）：
 * 1. 跳过前 4 字节长度头
 * 2. 用 TarsInputStream 解码 RequestPacket
 * 3. 从 RequestPacket.sBuffer 中解码 Map<string, Uint8Array>
 * 4. 从 Map 中取出 "tRsp" 对应的 Uint8Array，用 TarsInputStream 解码为响应结构
 */

import axios from 'axios';
import { TarsStruct, TarsConst } from '../tars/tars-struct.js';
import { TarsOutputStream, TarsInputStream } from '../tars/tars-codec.js';

/**
 * RequestPacket - Tars 请求包结构
 *
 * 对应 Dart 版 RequestPacket
 */
class RequestPacket {
  iVersion = 0;
  cPacketType = 0;
  iMessageType = 0;
  iRequestId = 0;
  sServantName = '';
  sFuncName = '';
  sBuffer: Uint8Array = new Uint8Array([0x0]);
  iTimeout = 0;
  context: Map<string, string> = new Map();
  status: Map<string, string> = new Map();

  writeTo(os: TarsOutputStream): void {
    os.writeInt(this.iVersion, 1);
    os.writeInt(this.cPacketType, 2);
    os.writeInt(this.iMessageType, 3);
    os.writeInt(this.iRequestId, 4);
    os.writeString(this.sServantName, 5);
    os.writeString(this.sFuncName, 6);
    os.writeBytes(this.sBuffer, 7);
    os.writeInt(this.iTimeout, 8);
    os.writeMap(this.context, 9);
    os.writeMap(this.status, 10);
  }

  readFrom(is_: TarsInputStream): void {
    this.iVersion = is_.readInt(1, false);
    this.cPacketType = is_.readInt(2, false);
    this.iMessageType = is_.readInt(3, false);
    this.iRequestId = is_.readInt(4, false);
    this.sServantName = is_.readString(5, false);
    this.sFuncName = is_.readString(6, false);
    this.sBuffer = is_.readBytes(7, false);
    this.iTimeout = is_.readInt(8, false);
    this.context = is_.readStringStringMap(9, false);
    this.status = is_.readStringStringMap(10, false);
  }
}

/**
 * Tars HTTP 客户端
 *
 * 对应 Dart 版 BaseTarsHttp
 * 只支持 PACKET_TYPE_TUP3 = 3 类型的封包
 */
export class BaseTarsHttp {
  readonly baseUrl: string;
  readonly servantName: string;
  readonly headers: Record<string, string>;

  constructor(
    baseUrl: string,
    servantName: string,
    options: { headers?: Record<string, string> } = {},
  ) {
    this.baseUrl = baseUrl;
    this.servantName = servantName;
    this.headers = options.headers ?? {};
  }

  /**
   * 发送 TUP 请求
   *
   * 对应 Dart 版 BaseTarsHttp.tupRequest
   *
   * @param methodName 方法名
   * @param tReq 请求结构体
   * @param tRsp 响应结构体（空实例，用于填充数据）
   * @returns 填充后的响应结构体
   */
  async tupRequest<REQ extends TarsStruct, RSP extends TarsStruct>(
    methodName: string,
    tReq: REQ,
    tRsp: RSP,
  ): Promise<RSP> {
    const data = this.buildRequest(methodName, tReq);

    const response = await axios.post(this.baseUrl, Buffer.from(data), {
      headers: {
        'Content-Type': 'application/x-wup',
        'Content-Length': data.length,
        ...this.headers,
      },
      responseType: 'arraybuffer',
      timeout: 60000,
      validateStatus: () => true,
    });

    const responseBytes = new Uint8Array(response.data as ArrayBuffer);
    const code = this.getResponseCode(responseBytes);

    if (code === 0) {
      return this.decodeResponse(responseBytes, tRsp);
    } else {
      throw new Error(`tupDecode decode error: ${code}`);
    }
  }

  /**
   * 构建请求包
   *
   * 对应 Dart 版 BaseTarsHttp.buildRequest + TarsUniPacket.encode
   */
  private buildRequest<REQ extends TarsStruct>(methodName: string, tReq: REQ): Uint8Array {
    // 1. 编码请求数据到 Map<string, Uint8Array>
    const newData = new Map<string, Uint8Array>();
    const reqOs = new TarsOutputStream();
    reqOs.write(tReq, 0);
    newData.set('tReq', reqOs.toUint8Array());

    // 2. 编码 newData 到 sBuffer
    const bufferOs = new TarsOutputStream();
    bufferOs.writeMap(newData, 0);
    const sBuffer = bufferOs.toUint8Array();

    // 3. 构建 RequestPacket
    const packet = new RequestPacket();
    packet.iVersion = TarsConst.PACKET_TYPE_TUP3;
    packet.cPacketType = TarsConst.PACKET_TYPE_TARSNORMAL;
    packet.iMessageType = 0;
    packet.iRequestId = 0;
    packet.sServantName = this.servantName;
    packet.sFuncName = methodName;
    packet.sBuffer = sBuffer;
    packet.iTimeout = 0;
    packet.context = new Map();
    packet.status = new Map();

    // 4. 序列化 RequestPacket
    const packetOs = new TarsOutputStream();
    packet.writeTo(packetOs);
    const body = packetOs.toBuffer();

    // 5. 添加 4 字节长度头
    const size = body.length;
    const sizeBuf = Buffer.alloc(4);
    sizeBuf.writeInt32BE(size + 4, 0);

    return new Uint8Array(Buffer.concat([sizeBuf, body]));
  }

  /**
   * 获取响应状态码
   */
  private getResponseCode(responseBytes: Uint8Array): number {
    try {
      const is_ = new TarsInputStream(responseBytes, 4); // 跳过 4 字节长度头
      const packet = new RequestPacket();
      packet.readFrom(is_);

      // 解码 sBuffer 中的 Map<string, Uint8Array>
      const bufferIs = new TarsInputStream(packet.sBuffer);
      const newData = bufferIs.readStringBytesMap(0, false);

      // code 存储在 key="" 中
      if (newData.has('')) {
        const codeIs = new TarsInputStream(newData.get('')!);
        return codeIs.readInt(0, true);
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * 解码响应数据
   *
   * 对应 Dart 版 BaseTarsHttp.tupResponseDecode
   */
  private decodeResponse<RSP extends TarsStruct>(responseBytes: Uint8Array, tRsp: RSP): RSP {
    const is_ = new TarsInputStream(responseBytes, 4); // 跳过 4 字节长度头
    const packet = new RequestPacket();
    packet.readFrom(is_);

    // 解码 sBuffer 中的 Map<string, Uint8Array>
    const bufferIs = new TarsInputStream(packet.sBuffer);
    const newData = bufferIs.readStringBytesMap(0, false);

    // 从 "tRsp" 中解码响应结构
    if (newData.has('tRsp')) {
      const rspIs = new TarsInputStream(newData.get('tRsp')!);
      tRsp.readFrom(rspIs);
    }

    return tRsp;
  }
}
