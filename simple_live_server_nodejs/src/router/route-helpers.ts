/**
 * 路由辅助方法
 *
 * 对应 Dart 版各 Router 中的 _json / _badRequest / _error 辅助方法
 */

import { FastifyReply } from 'fastify';
import { ApiResponse } from '../dto/api-response.js';

/**
 * 发送成功响应
 */
export function sendJson(reply: FastifyReply, data: unknown): void {
  reply.send(ApiResponse.success(data));
}

/**
 * 发送 400 错误
 */
export function sendBadRequest(reply: FastifyReply, msg: string): void {
  reply.code(400).send(ApiResponse.error(400, msg));
}

/**
 * 发送错误响应
 *
 * 判断是否为参数错误（不支持的平台等），返回 404；其余返回 500
 */
export function sendError(reply: FastifyReply, e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  // 判断是否为参数错误（平台不存在等）
  if (e instanceof Error && e.message.includes('不支持的平台')) {
    reply.code(404).send(ApiResponse.error(404, msg));
    return;
  }
  reply.code(500).send(ApiResponse.error(500, msg));
}

/**
 * 发送自定义状态码错误
 */
export function sendCustomError(reply: FastifyReply, code: number, msg: string): void {
  reply.code(code).send(ApiResponse.error(code, msg));
}

/**
 * 从请求中解析分页 page 参数
 */
export function getPage(query: Record<string, unknown>): number {
  const raw = query['page'];
  if (typeof raw === 'string') {
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? 1 : parsed;
  }
  if (typeof raw === 'number') {
    return raw;
  }
  return 1;
}

