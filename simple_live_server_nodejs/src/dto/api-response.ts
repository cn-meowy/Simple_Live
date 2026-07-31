/**
 * 统一 API 响应包装
 *
 * 对应 Dart 版 simple_live_server/lib/dto/api_response.dart
 */

export interface ApiResponseData<T = unknown> {
  code: number;
  data: T | null;
  msg: string;
}

export class ApiResponse {
  /** 成功响应 */
  static success<T>(data: T): ApiResponseData<T> {
    return {
      code: 0,
      data,
      msg: '',
    };
  }

  /** 错误响应 */
  static error(code: number, msg: string): ApiResponseData<null> {
    return {
      code,
      data: null,
      msg,
    };
  }

  /** 序列化为 JSON 字符串 */
  static stringify<T>(response: ApiResponseData<T>): string {
    return JSON.stringify(response);
  }
}
