/**
 * 配置区域 - 默认值
 * 所有配置项都支持通过 Cloudflare 环境变量覆盖，优先级：环境变量 > 代码默认值
 *
 * 环境变量配置（可选）：
 * - PRODUCT_NAME: 产品名称
 * - BARK_KEY: 你的 Bark 推送 Key
 * - BARK_ICON: 通知的默认图标 URL
 * - ENABLE_SANDBOX_NOTIFICATIONS: 是否推送测试环境通知 ("true" 或 "false")
 * - FORWARD_URL: 转发通知的目标 URL（可选）
 * - NOTIFICATION_CONFIG: 通知类型配置 (JSON 字符串)，可配置各类通知的开关、图标、声音等
 */
const PRODUCT_NAME = "iRich"; // 提示：替换为你的产品名称
const BARK_KEY = ""; // ⚠️ 替换为你的 Key
const BARK_ICON = ""; // 可选：默认图标 URL
const ENABLE_SANDBOX_NOTIFICATIONS = false; // 是否推送 Sandbox 测试环境的通知
const FORWARD_URL = ""; // 可选：转发通知到其他服务的 URL

/**
 * 通知类型配置 - 默认值
 * 每个类别可单独配置: enabled(开关), icon(图标), sound(声音), group(分组)
 * 环境变量 NOTIFICATION_CONFIG 可覆盖，格式为 JSON 字符串
 */
const NOTIFICATION_CONFIG = {
  // 正向收入通知 (新订阅、续订、优惠等)
  REVENUE: {
    enabled: true,
    icon: "",
    sound: "calypso",
    group: "Revenue"
  },
  // 退款通知
  REFUND: {
    enabled: false,
    icon: "",
    sound: "minuet",
    group: "Refund"
  },
  // 风险预警 (续订失败、过期等)
  RISK: {
    enabled: false,
    icon: "",
    sound: "chord",
    group: "Risk"
  },
  // 状态变更通知 (自动续订开关、计划变更等)
  STATUS: {
    enabled: false,
    icon: "",
    sound: "popcorn",
    group: "Status"
  }
};

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

// ==================== 业务逻辑函数 ====================

async function handleAppleNotification(data, env) {
  // 读取基础配置（优先使用环境变量）
  const productName = env.PRODUCT_NAME || PRODUCT_NAME;
  const barkKey = env.BARK_KEY || BARK_KEY;
  const barkIcon = env.BARK_ICON || BARK_ICON;
  const forwardUrl = env.FORWARD_URL || FORWARD_URL;
  const enableSandbox = env.ENABLE_SANDBOX_NOTIFICATIONS === "true" ||
                        (env.ENABLE_SANDBOX_NOTIFICATIONS === undefined && ENABLE_SANDBOX_NOTIFICATIONS);

  // 读取通知类型配置
  const notificationConfig = getNotificationConfig(env);

  if (!data || !data.signedPayload) {
    return { status: "ignored", message: "Missing signedPayload" };
  }

  // 转发原始通知到其他服务（不阻塞主流程）
  if (forwardUrl) {
    forwardNotification(forwardUrl, data).catch(e => {
      console.error("Forward notification error (non-blocking):", e);
    });
  }

  // 1. 解码第一层
  const payload = decodeJWS(data.signedPayload);
  if (!payload) return { status: "error", message: "JWS Decode Failed" };

  const notificationType = payload.notificationType;
  const subtype = payload.subtype;
  const envName = payload.data?.environment || "Production";

  console.log(`Received: ${notificationType} | ${subtype} | ${envName}`);

  // 2. 检查是否推送测试环境通知
  if (envName === "Sandbox" && !enableSandbox) {
    console.log("Sandbox notification ignored (ENABLE_SANDBOX_NOTIFICATIONS = false)");
    return { status: "ignored", message: "Sandbox notifications disabled" };
  }

  // 3. 获取事件配置
  const eventConfig = getEventConfig(notificationType, subtype);
  if (!eventConfig) {
    return { status: "ignored", message: `Unknown event: ${notificationType}|${subtype}` };
  }

  // 4. 检查该类别通知是否启用
  const categoryConfig = notificationConfig[eventConfig.category];
  if (!categoryConfig || !categoryConfig.enabled) {
    console.log(`${eventConfig.category} notifications disabled`);
    return { status: "ignored", message: `${eventConfig.category} notifications disabled` };
  }

  // 5. 解码第二层 (获取产品ID、价格、优惠信息等)
  let productId = "未知产品";
  let priceInfo = "";
  let offerInfo = "";
  let offerPeriodInfo = "";

  try {
    if (payload.data && payload.data.signedTransactionInfo) {
      const transactionInfo = decodeJWS(payload.data.signedTransactionInfo);
      if (transactionInfo) {
        // 产品ID
        if (transactionInfo.productId) {
          productId = transactionInfo.productId;
        }

        // 价格信息
        const formattedPrice = formatPrice(transactionInfo.price, transactionInfo.currency);
        if (formattedPrice) {
          priceInfo = formattedPrice;
        }

        // 优惠类型和时长
        const offerType = transactionInfo.offerType;
        const offerDiscountType = transactionInfo.offerDiscountType;
        const offerIdentifier = transactionInfo.offerIdentifier;
        const offerPeriod = transactionInfo.offerPeriod;

        // 解析优惠时长
        const parsedPeriod = parseOfferPeriod(offerPeriod);

        if (offerType === 3 || offerType === "winback") {
          // 挽回优惠
          offerInfo = " (挽回优惠)";
          if (parsedPeriod) {
            if (offerDiscountType === "FREE_TRIAL") {
              offerPeriodInfo = `优惠时长：免费 ${parsedPeriod}`;
            } else {
              offerPeriodInfo = `优惠时长：${parsedPeriod}`;
            }
          }
        } else if (offerType === 2 || offerType === "promotional") {
          // 促销优惠
          offerInfo = offerIdentifier ? ` (${offerIdentifier})` : " (促销优惠)";
          if (parsedPeriod) {
            if (offerDiscountType === "FREE_TRIAL") {
              offerPeriodInfo = `优惠时长：免费 ${parsedPeriod}`;
            } else {
              offerPeriodInfo = `优惠时长：${parsedPeriod}`;
            }
          }
        } else if (offerType === 1 || offerType === "introductory") {
          // 引导优惠
          if (offerDiscountType === "FREE_TRIAL") {
            offerInfo = " (免费试用)";
            if (parsedPeriod) {
              offerPeriodInfo = `试用时长：${parsedPeriod}`;
            }
          } else {
            offerInfo = " (引导优惠)";
            if (parsedPeriod) {
              offerPeriodInfo = `优惠时长：${parsedPeriod}`;
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("Inner JWS error", e);
  }

  // 6. 构建通知消息
  const isSandbox = envName === "Sandbox";
  const emoji = isSandbox ? "🧪" : eventConfig.emoji;

  // 根据类别确定标题
  let titleSuffix;
  switch (eventConfig.category) {
    case "REVENUE":
      titleSuffix = "新收入！";
      break;
    case "REFUND":
      titleSuffix = "退款通知";
      break;
    case "RISK":
      titleSuffix = "风险预警";
      break;
    case "STATUS":
      titleSuffix = "状态变更";
      break;
    default:
      titleSuffix = "通知";
  }

  const sandboxPrefix = isSandbox ? "[测试] " : "";
  const title = `${emoji} ${sandboxPrefix}${productName} ${titleSuffix}`;

  // 构建消息体
  let bodyLines = [`类型：${eventConfig.name}`];
  bodyLines.push(`产品：${productId}${offerInfo}`);

  if (priceInfo && eventConfig.category !== "STATUS") {
    bodyLines.push(`金额：${priceInfo}`);
  }

  if (offerPeriodInfo) {
    bodyLines.push(offerPeriodInfo);
  }

  const body = bodyLines.join('\n');

  // 7. 发送 Bark 通知
  await sendBarkNotification(barkKey, title, body, {
    icon: categoryConfig.icon || barkIcon,
    sound: categoryConfig.sound,
    group: categoryConfig.group
  });

  return { status: "success", message: `Notification sent: ${eventConfig.name}` };
}

// ==================== 辅助工具函数 ====================

function decodeJWS(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 3) return null;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) base64 += new Array(5 - pad).join('=');
    return JSON.parse(atob(base64));
  } catch (e) {
    return null;
  }
}

/**
 * 深度合并对象
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * 获取通知配置（合并环境变量覆盖）
 */
function getNotificationConfig(env) {
  if (env?.NOTIFICATION_CONFIG) {
    try {
      const envConfig = JSON.parse(env.NOTIFICATION_CONFIG);
      return deepMerge(NOTIFICATION_CONFIG, envConfig);
    } catch (e) {
      console.error("NOTIFICATION_CONFIG parse error:", e);
    }
  }
  return NOTIFICATION_CONFIG;
}

/**
 * 解析 ISO 8601 duration 格式的优惠时长
 * P1D=1天, P7D=7天, P1W=1周, P1M=1个月, P3M=3个月, P1Y=1年
 */
function parseOfferPeriod(period) {
  if (!period) return null;
  const match = period.match(/^P(\d+)([DWMY])$/);
  if (!match) return period;
  const [, num, unit] = match;
  const units = { D: '天', W: '周', M: '个月', Y: '年' };
  return `${num}${units[unit] || unit}`;
}

/**
 * 格式化价格（毫单位转换）
 */
function formatPrice(price, currency) {
  if (price === undefined || price === null || !currency) return null;
  const amount = price / 1000;
  try {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: currency
    }).format(amount);
  } catch (e) {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * 获取事件配置
 * 返回: { name: 事件中文名, category: 类别(REVENUE/REFUND/RISK/STATUS), emoji: 图标 }
 */
function getEventConfig(type, subtype) {
  const key = `${type}|${subtype || ''}`;
  const keyTypeOnly = `${type}|`;

  // 所有事件映射表
  const eventMap = {
    // ============ 正向收入事件 (REVENUE) ============
    "SUBSCRIBED|INITIAL_BUY": { name: "新订阅 (首次)", category: "REVENUE", emoji: "🎉" },
    "SUBSCRIBED|RESUBSCRIBE": { name: "重新订阅", category: "REVENUE", emoji: "🎉" },
    "DID_RENEW|": { name: "续订成功", category: "REVENUE", emoji: "🎉" },
    "DID_RENEW|BILLING_RECOVERY": { name: "续订恢复", category: "REVENUE", emoji: "🎉" },
    "ONE_TIME_CHARGE|": { name: "一次性购买", category: "REVENUE", emoji: "🎉" },
    "OFFER_REDEEMED|INITIAL_BUY": { name: "优惠首购", category: "REVENUE", emoji: "🎉" },
    "OFFER_REDEEMED|RESUBSCRIBE": { name: "优惠重订", category: "REVENUE", emoji: "🎉" },
    "OFFER_REDEEMED|UPGRADE": { name: "优惠升级", category: "REVENUE", emoji: "🎉" },
    "OFFER_REDEEMED|DOWNGRADE": { name: "优惠降级", category: "REVENUE", emoji: "🎉" },
    "REFUND_REVERSED|": { name: "退款撤销", category: "REVENUE", emoji: "🎉" },

    // ============ 退款事件 (REFUND) ============
    "REFUND|": { name: "退款", category: "REFUND", emoji: "💸" },
    "REFUND|CONSUMPTION_REQUEST": { name: "消耗品退款请求", category: "REFUND", emoji: "💸" },
    "CONSUMPTION_REQUEST|": { name: "消耗品信息请求", category: "REFUND", emoji: "💸" },

    // ============ 风险预警事件 (RISK) ============
    "DID_FAIL_TO_RENEW|": { name: "续订失败", category: "RISK", emoji: "⚠️" },
    "DID_FAIL_TO_RENEW|GRACE_PERIOD": { name: "续订失败 (宽限期)", category: "RISK", emoji: "⚠️" },
    "EXPIRED|VOLUNTARY": { name: "主动取消过期", category: "RISK", emoji: "⚠️" },
    "EXPIRED|BILLING_RETRY": { name: "账单重试失败过期", category: "RISK", emoji: "⚠️" },
    "EXPIRED|PRICE_INCREASE": { name: "拒绝涨价过期", category: "RISK", emoji: "⚠️" },
    "EXPIRED|PRODUCT_NOT_FOR_SALE": { name: "产品下架过期", category: "RISK", emoji: "⚠️" },
    "GRACE_PERIOD_EXPIRED|": { name: "宽限期结束", category: "RISK", emoji: "⚠️" },
    "REVOKE|": { name: "订阅被撤销", category: "RISK", emoji: "⚠️" },

    // ============ 状态变更事件 (STATUS) ============
    "DID_CHANGE_RENEWAL_STATUS|AUTO_RENEW_DISABLED": { name: "关闭自动续订", category: "STATUS", emoji: "ℹ️" },
    "DID_CHANGE_RENEWAL_STATUS|AUTO_RENEW_ENABLED": { name: "开启自动续订", category: "STATUS", emoji: "ℹ️" },
    "DID_CHANGE_RENEWAL_PREF|UPGRADE": { name: "计划升级", category: "STATUS", emoji: "ℹ️" },
    "DID_CHANGE_RENEWAL_PREF|DOWNGRADE": { name: "计划降级", category: "STATUS", emoji: "ℹ️" },
    "PRICE_INCREASE|PENDING": { name: "涨价待确认", category: "STATUS", emoji: "ℹ️" },
    "PRICE_INCREASE|ACCEPTED": { name: "涨价已同意", category: "STATUS", emoji: "ℹ️" },
    "RENEWAL_EXTENDED|": { name: "订阅已延期", category: "STATUS", emoji: "ℹ️" },
    "RENEWAL_EXTENSION|SUMMARY": { name: "批量延期完成", category: "STATUS", emoji: "ℹ️" },
    "RENEWAL_EXTENSION|FAILURE": { name: "延期失败", category: "STATUS", emoji: "ℹ️" },
    "EXTERNAL_PURCHASE_TOKEN|": { name: "外部购买令牌", category: "STATUS", emoji: "ℹ️" },
    "TEST|": { name: "测试通知", category: "STATUS", emoji: "🧪" }
  };

  if (eventMap[key]) return eventMap[key];
  if (eventMap[keyTypeOnly]) return eventMap[keyTypeOnly];
  return null;
}

async function sendBarkNotification(key, title, body, options = {}) {
  if (!key) return;
  const { icon = "", sound = "calypso", group = "Revenue" } = options;
  try {
    await fetch(`https://api.day.app/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title,
        body: body,
        sound: sound,
        icon: icon,
        group: group
      })
    });
  } catch (e) {
    console.error("Bark Send Error", e);
  }
}

async function forwardNotification(url, data) {
  if (!url) return;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    console.log(`Forwarded to ${url}, status: ${response.status}`);
  } catch (e) {
    console.error("Forward Error", e);
    throw e; // 重新抛出以便调用方记录
  }
}

// ==================== HTML 页面模板 ====================

function maskBarkKey(key) {
  if (!key || key.length <= 8) return "****";
  const start = key.substring(0, 4);
  const end = key.substring(key.length - 4);
  return `${start}****${end}`;
}

function maskUrl(url) {
  if (!url) return "";
  try {
    const urlObj = new URL(url);
    // 显示域名 + 路径掩码
    const hasPaths = urlObj.pathname && urlObj.pathname !== '/';
    return urlObj.hostname + (hasPaths ? '/****' : '');
  } catch (e) {
    // 如果不是有效URL，显示前20个字符
    return url.length > 20 ? url.substring(0, 20) + "..." : url;
  }
}

function renderHtml(currentUrl, env) {
  // 读取当前配置（优先使用环境变量）
  const productName = env?.PRODUCT_NAME || PRODUCT_NAME;
  const barkKey = env?.BARK_KEY || BARK_KEY;
  const barkIcon = env?.BARK_ICON || BARK_ICON;
  const forwardUrl = env?.FORWARD_URL || FORWARD_URL;
  const enableSandbox = env?.ENABLE_SANDBOX_NOTIFICATIONS === "true" ||
                        (env?.ENABLE_SANDBOX_NOTIFICATIONS === undefined && ENABLE_SANDBOX_NOTIFICATIONS);

  // 读取通知类型配置
  const notificationConfig = getNotificationConfig(env);

  const maskedBarkKey = maskBarkKey(barkKey);
  const maskedForwardUrl = maskUrl(forwardUrl);

  // 这里是你要测试的 Mock 数据
  const MOCK_PAYLOAD = {
    "signedPayload": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJub3RpZmljYXRpb25UeXBlIjoiU1VCU0NSSUJFRCIsInN1YnR5cGUiOiJJTklUSUFMX0JVWSIsIm5vdGlmaWNhdGlvblVVSUQiOiIxMjM0NTY3OC0xMjM0LTEyMzQtMTIzNC0xMjM0NTY3ODkwMTIiLCJkYXRhIjp7InNpZ25lZFRyYW5zYWN0aW9uSW5mbyI6ImV5SmhiR2NpT2lKRlV6STFOaUlzSW5SNWNDSTZJa3BYVkNKOS5leUp3Y205a2RXTjBTV1FpT2lKamIyMHVibVY0ZEd4bFlYQnNZV0p6TG1sU2FXTm9MbkJ5WlcxcGRXMGlMQ0owY21GdWMyRmpkR2x2Ymtsa0lqb2lNakF3TURBd01ERXlNelExTmpjNE9TSXNJbTl5YVdkcGJtRnNWSEpoYm5OaFkzUnBiMjVKWkNJNklqSXdNREF3TURBeE1qTTBOVFkzT0RraUxDSndkWEpqYUdGelpVUmhkR1VpT2pFM01EQXdNREF3TURBd01EQXNJbTl5YVdkcGJtRnNVSFZ5WTJoaGMyVkVZWFJsSWpveE56QXdNREF3TURBd01EQXdmUS5mYWtlX3NpZ25hdHVyZV9pbm5lciJ9LCJ2ZXJzaW9uIjoiMi4wIiwic2lnbmVkRGF0ZSI6MTcwMDAwMDAwMDAwMH0.fake_signature_outer"
  };

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Apple Notification Server</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background-color: #f5f5f7; color: #1d1d1f; padding: 20px; }
    .card { background: white; padding: 40px; border-radius: 18px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; max-width: 500px; width: 100%; }
    h1 { font-size: 24px; margin-bottom: 10px; }
    p { color: #86868b; margin-bottom: 20px; }
    .status { display: inline-block; background: #e3f5e6; color: #168030; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
    .warning-banner { background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; padding: 15px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
    .warning-banner-icon { font-size: 24px; }
    .warning-banner-content { flex: 1; }
    .warning-banner-title { font-size: 14px; font-weight: 600; color: #856404; margin: 0 0 5px 0; }
    .warning-banner-text { font-size: 12px; color: #856404; margin: 0; line-height: 1.5; }
    .url-box { background: #f5f5f7; padding: 15px; border-radius: 8px; margin: 20px 0; border: 2px dashed #d2d2d7; }
    .url-box h3 { font-size: 14px; color: #1d1d1f; margin: 0 0 10px 0; font-weight: 600; }
    .url-box p { font-size: 11px; color: #86868b; margin-bottom: 10px; }
    .url-display { display: flex; flex-direction: row; align-items: center; gap: 10px; }
    .url-input { width: calc(80% - 5px); background: white; border: 1px solid #d2d2d7; border-radius: 6px; padding: 10px 12px; font-size: 12px; color: #1d1d1f; font-family: 'Monaco', 'Menlo', monospace; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.5; }
    .copy-btn { width: 20%; background: #0071e3; color: white; border: none; padding: 10px 8px; font-size: 13px; border-radius: 6px; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
    .copy-btn:hover { background: #0077ed; }
    .copy-btn:active { transform: scale(0.95); }
    .copy-btn.copied { background: #168030; }
    .config-box { background: #f9f9fb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e5e7; }
    .config-box h3 { font-size: 14px; color: #1d1d1f; margin: 0 0 12px 0; font-weight: 600; }
    .config-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e5e5e7; }
    .config-item:last-child { border-bottom: none; }
    .config-label { font-size: 12px; color: #86868b; font-weight: 500; }
    .config-value { font-size: 12px; color: #1d1d1f; font-family: 'Monaco', 'Menlo', monospace; background: white; padding: 4px 8px; border-radius: 4px; }
    .config-value.enabled { color: #168030; font-weight: 600; }
    .config-value.disabled { color: #d1180b; font-weight: 600; }
    .config-value.warning { color: #d1180b; font-weight: 600; background: #fff3cd; border: 1px solid #ffc107; }
    .config-icon { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; border: 1px solid #e5e5e7; }
    button { background: #0071e3; color: white; border: none; padding: 12px 24px; font-size: 16px; border-radius: 980px; cursor: pointer; transition: all 0.2s; width: 100%; }
    button:hover { background: #0077ed; transform: scale(1.02); }
    button:active { transform: scale(0.98); }
    button:disabled { background: #ccc; cursor: wait; }
    .log { margin-top: 20px; font-size: 12px; color: #666; text-align: left; background: #f5f5f7; padding: 10px; border-radius: 8px; display: none; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <div class="status">● 服务运行中 (Active)</div>
    <h1>Apple 通知转发器</h1>
    <p>后端已就绪，可以接收 App Store Server Notifications V2。</p>

    <div class="url-box">
      <h3>📋 配置 URL</h3>
      <p>请将下方 URL 复制到 App Store Connect 的服务器通知配置中</p>
      <div class="url-display">
        <div class="url-input" id="notificationUrl">${currentUrl}</div>
        <button class="copy-btn" onclick="copyUrl()">复制</button>
      </div>
    </div>

    <div class="config-box">
      <h3>⚙️ 当前配置</h3>
      <div class="config-item">
        <span class="config-label">产品名称</span>
        <span class="config-value">${productName}</span>
      </div>
      <div class="config-item">
        <span class="config-label">Bark Key</span>
        <span class="config-value ${!barkKey ? 'warning' : ''}">${!barkKey ? '⚠️ 未配置' : maskedBarkKey}</span>
      </div>
      <div class="config-item">
        <span class="config-label">默认图标</span>
        ${barkIcon ? `<img src="${barkIcon}" alt="Bark Icon" class="config-icon" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" /><span class="config-value" style="display:none;">加载失败</span>` : '<span class="config-value">未设置</span>'}
      </div>
      <div class="config-item">
        <span class="config-label">测试环境推送</span>
        <span class="config-value ${enableSandbox ? 'enabled' : 'disabled'}">${enableSandbox ? '已启用' : '已禁用'}</span>
      </div>
      <div class="config-item">
        <span class="config-label">转发 URL</span>
        <span class="config-value">${forwardUrl ? maskedForwardUrl : '未设置'}</span>
      </div>
    </div>

    <div class="config-box">
      <h3>📬 通知类型开关</h3>
      <div class="config-item">
        <span class="config-label">🎉 收入通知</span>
        <span class="config-value ${notificationConfig.REVENUE?.enabled ? 'enabled' : 'disabled'}">${notificationConfig.REVENUE?.enabled ? '已启用' : '已禁用'}</span>
      </div>
      <div class="config-item">
        <span class="config-label">💸 退款通知</span>
        <span class="config-value ${notificationConfig.REFUND?.enabled ? 'enabled' : 'disabled'}">${notificationConfig.REFUND?.enabled ? '已启用' : '已禁用'}</span>
      </div>
      <div class="config-item">
        <span class="config-label">⚠️ 风险预警</span>
        <span class="config-value ${notificationConfig.RISK?.enabled ? 'enabled' : 'disabled'}">${notificationConfig.RISK?.enabled ? '已启用' : '已禁用'}</span>
      </div>
      <div class="config-item">
        <span class="config-label">ℹ️ 状态变更</span>
        <span class="config-value ${notificationConfig.STATUS?.enabled ? 'enabled' : 'disabled'}">${notificationConfig.STATUS?.enabled ? '已启用' : '已禁用'}</span>
      </div>
    </div>

    <button id="testBtn" onclick="sendTest()">发送测试通知</button>
    <div id="logArea" class="log"></div>
  </div>

  <script>
    function copyUrl() {
      const urlText = document.getElementById('notificationUrl').innerText;
      const btn = event.target;

      navigator.clipboard.writeText(urlText).then(() => {
        const originalText = btn.innerText;
        btn.innerText = '已复制 ✓';
        btn.classList.add('copied');

        setTimeout(() => {
          btn.innerText = originalText;
          btn.classList.remove('copied');
        }, 2000);
      }).catch(err => {
        console.error('复制失败:', err);
        alert('复制失败，请手动选择并复制');
      });
    }

    async function sendTest() {
      const btn = document.getElementById('testBtn');
      const log = document.getElementById('logArea');
      
      btn.disabled = true;
      btn.innerText = "发送中...";
      log.style.display = 'none';

      const payload = ${JSON.stringify(MOCK_PAYLOAD)};

      try {
        // 发送 POST 请求给当前页面 URL
        const response = await fetch("${currentUrl}", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (response.ok) {
          btn.innerText = "发送成功 ✅";
          log.innerHTML = "<strong>后端返回:</strong><br/>" + JSON.stringify(result, null, 2);
          log.style.display = 'block';
          // 3秒后恢复按钮
          setTimeout(() => { btn.disabled = false; btn.innerText = "再次发送测试通知"; }, 3000);
        } else {
          throw new Error(result.message || "Unknown Error");
        }
      } catch (e) {
        btn.innerText = "发送失败 ❌";
        log.innerHTML = "<strong>错误:</strong> " + e.message;
        log.style.display = 'block';
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>
  `;
}
