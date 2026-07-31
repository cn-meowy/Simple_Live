/**
 * HTTP 客户端封装
 *
 * 对应 Dart 版 simple_live_core/lib/src/common/http_client.dart
 * 基于 axios 实现，支持 GET/POST/HEAD，自动处理 JSON 解析。
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { CoreError } from './core-error.js';
import { CoreLog } from './core-log.js';

export type QueryParameters = Record<string, string | number | boolean | undefined>;
export type HeaderMap = Record<string, string>;

export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  data: unknown;
}

export class HttpClient {
  private static _instance: HttpClient | null = null;

  static get instance(): HttpClient {
    if (this._instance === null) {
      this._instance = new HttpClient();
    }
    return this._instance;
  }

  private readonly axiosInstance: AxiosInstance;

  private constructor() {
    this.axiosInstance = axios.create({
      timeout: 20000,
      // 允许在 4xx/5xx 状态下返回响应而非抛错（与 Dart head 方法行为一致）
      validateStatus: () => true,
      maxRedirects: 5,
    });
  }

  /**
   * GET 请求，返回字符串
   *
   * 对应 Dart 版 HttpClient.getText
   */
  async getText(
    url: string,
    options: {
      queryParameters?: QueryParameters;
      header?: HeaderMap;
    } = {},
  ): Promise<string> {
    const { queryParameters, header } = options;
    try {
      const response = await this.axiosInstance.get(url, {
        params: queryParameters,
        headers: header,
        responseType: 'text',
        transformResponse: [(data) => data], // 不自动解析 JSON
      });
      this.checkResponseStatus(response);
      return response.data as string;
    } catch (e) {
      throw this.wrapError(e, '发送GET请求失败');
    }
  }

  /**
   * GET 请求，返回 JSON（解析为对象）
   *
   * 对应 Dart 版 HttpClient.getJson
   */
  async getJson(
    url: string,
    options: {
      queryParameters?: QueryParameters;
      header?: HeaderMap;
    } = {},
  ): Promise<any> {
    const { queryParameters, header } = options;
    try {
      const response = await this.axiosInstance.get(url, {
        params: queryParameters,
        headers: header,
        responseType: 'json',
      });
      this.checkResponseStatus(response);
      return response.data;
    } catch (e) {
      throw this.wrapError(e, '发送GET请求失败');
    }
  }

  /**
   * POST 请求，返回 JSON（解析为对象）
   *
   * 对应 Dart 版 HttpClient.postJson
   *
   * @param formUrlEncoded 是否使用 application/x-www-form-urlencoded
   */
  async postJson(
    url: string,
    options: {
      queryParameters?: QueryParameters;
      data?: unknown;
      header?: HeaderMap;
      formUrlEncoded?: boolean;
    } = {},
  ): Promise<any> {
    const { queryParameters, data, header, formUrlEncoded } = options;
    try {
      const config: AxiosRequestConfig = {
        params: queryParameters,
        headers: header,
        responseType: 'json',
      };

      if (formUrlEncoded) {
        config.headers = {
          ...header,
          'Content-Type': 'application/x-www-form-urlencoded',
        };
        // axios 自动序列化对象为 urlencoded
        config.data = data;
      } else {
        config.data = data;
      }

      const response = await this.axiosInstance.post(url, config.data, config);
      this.checkResponseStatus(response);
      return response.data;
    } catch (e) {
      throw this.wrapError(e, '发送POST请求失败');
    }
  }

  /**
   * HEAD 请求，返回完整响应（含 headers）
   *
   * 对应 Dart 版 HttpClient.head
   * 即使状态码非 2xx 也返回响应对象（与 Dart 行为一致）。
   */
  async head(
    url: string,
    options: {
      queryParameters?: QueryParameters;
      header?: HeaderMap;
    } = {},
  ): Promise<HttpResponse> {
    const { queryParameters, header } = options;
    try {
      const response = await this.axiosInstance.head(url, {
        params: queryParameters,
        headers: header,
      });
      return this.toHttpResponse(response);
    } catch (e) {
      throw this.wrapError(e, '发送HEAD请求失败');
    }
  }

  private checkResponseStatus(response: AxiosResponse): void {
    if (response.status >= 400) {
      throw new CoreError(
        typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
        response.status,
      );
    }
  }

  private toHttpResponse(response: AxiosResponse): HttpResponse {
    const headers: Record<string, string> = {};
    // axios headers 是 AxiosHeaders 实例，需要遍历
    for (const [key, value] of Object.entries(response.headers)) {
      if (typeof value === 'string') {
        headers[key.toLowerCase()] = value;
      } else if (Array.isArray(value)) {
        headers[key.toLowerCase()] = value.join(', ');
      }
    }
    return {
      statusCode: response.status,
      headers,
      data: response.data,
    };
  }

  private wrapError(e: unknown, defaultMessage: string): CoreError {
    if (e instanceof CoreError) return e;
    if (e instanceof AxiosError) {
      if (e.response) {
        const msg = e.message || '';
        return new CoreError(msg, e.response.status);
      }
      return new CoreError(defaultMessage);
    }
    if (e instanceof Error) {
      return new CoreError(e.message);
    }
    return new CoreError(defaultMessage);
  }
}
