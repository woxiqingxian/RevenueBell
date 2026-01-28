/**
 * Cloudflare Worker 入口
 * Apple App Store Server Notifications V2 接收器
 *
 * 路由:
 *   GET  /           → 应用列表页面
 *   GET  /:appName   → 该应用的管理页面
 *   POST /:appName   → 接收该应用的 Apple 通知
 */

import { handleAppleNotification } from './src/handler.js';
import { renderAppListHtml, renderAppHtml } from './src/template.js';
import { getAppConfig, getAppList } from './config.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 解析应用名称 (去掉开头的 /)
    const appName = path.slice(1);

    // ==================== 1. 根路径 - 应用列表 ====================
    if (path === "/" || path === "") {
      if (request.method === "GET") {
        return new Response(renderAppListHtml(url.origin, env), {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }
      return new Response("Method Not Allowed", { status: 405 });
    }

    // ==================== 2. 应用路径 /:appName ====================
    const appConfig = getAppConfig(appName, env);

    if (!appConfig) {
      return new Response(JSON.stringify({
        status: "error",
        message: `App not found: ${appName}`
      }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // GET - 显示应用管理页面
    if (request.method === "GET") {
      return new Response(renderAppHtml(appName, url.href, appConfig, env), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // POST - 处理 Apple 通知
    if (request.method === "POST") {
      try {
        const data = await request.json();
        const result = await handleAppleNotification(data, appName, appConfig, env);

        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
          status: 200
        });

      } catch (e) {
        console.error(`Error [${appName}]: ${e}`);
        return new Response(JSON.stringify({ status: "error", message: String(e) }), { status: 200 });
      }
    }

    return new Response("Method Not Allowed", { status: 405 });
  }
};
