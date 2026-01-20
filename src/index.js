/**
 * Cloudflare Worker 入口
 * Apple App Store Server Notifications V2 接收器
 */

import { handleAppleNotification } from './handler.js';
import { renderHtml } from './template.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ==================== 1. 处理 GET 请求 (返回 HTML 页面) ====================
    if (request.method === "GET") {
      return new Response(renderHtml(url.href, env), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // ==================== 2. 处理 POST 请求 (处理苹果通知) ====================
    if (request.method === "POST") {
      try {
        const data = await request.json();

        // 核心处理逻辑
        const result = await handleAppleNotification(data, env);

        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
          status: 200
        });

      } catch (e) {
        console.error(`Error: ${e}`);
        // 返回 200 避免 Apple 重试，但在 Body 里记录错误
        return new Response(JSON.stringify({ status: "error", message: String(e) }), { status: 200 });
      }
    }

    return new Response("Method Not Allowed", { status: 405 });
  }
};
