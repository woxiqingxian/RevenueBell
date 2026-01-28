/**
 * Apple 通知处理核心逻辑
 */

import { getEventConfig } from './events.js';
import {
  decodeJWS,
  formatPrice,
  parseOfferPeriod,
  sendBarkNotification,
  forwardNotification
} from './utils.js';

/**
 * 处理 Apple App Store Server Notification
 * @param {object} data - 通知数据
 * @param {string} appName - 应用名称
 * @param {object} appConfig - 应用配置
 * @param {object} env - 环境变量
 * @returns {Promise<{status: string, message: string}>}
 */
export async function handleAppleNotification(data, appName, appConfig, env) {
  // 从应用配置读取
  const productName = appConfig.productName;
  const barkKey = appConfig.barkKey;
  const barkIcon = appConfig.barkIcon;
  const forwardUrl = appConfig.forwardUrl;
  const enableSandbox = appConfig.enableSandbox;
  const notificationConfig = appConfig.notifications;

  if (!data || !data.signedPayload) {
    return { status: "ignored", message: "Missing signedPayload" };
  }

  // 转发原始通知到其他服务（不阻塞主流程）
  if (forwardUrl) {
    forwardNotification(forwardUrl, data).catch(e => {
      console.error(`[${appName}] Forward error (non-blocking):`, e);
    });
  }

  // 1. 解码第一层
  const payload = decodeJWS(data.signedPayload);
  if (!payload) return { status: "error", message: "JWS Decode Failed" };

  const notificationType = payload.notificationType;
  const subtype = payload.subtype;
  const envName = payload.data?.environment || "Production";

  console.log(`[${appName}] Received: ${notificationType} | ${subtype} | ${envName}`);

  // 2. 检查是否推送测试环境通知
  if (envName === "Sandbox" && !enableSandbox) {
    console.log(`[${appName}] Sandbox notification ignored`);
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
    console.log(`[${appName}] ${eventConfig.category} notifications disabled`);
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
    console.error(`[${appName}] Inner JWS error`, e);
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

  // 7. 发送 Bark 通知（按 APP 分组）
  const groupName = `${productName}-${categoryConfig.group}`;
  await sendBarkNotification(barkKey, title, body, {
    icon: categoryConfig.icon || barkIcon,
    sound: categoryConfig.sound,
    group: groupName
  });

  return { status: "success", message: `Notification sent: ${eventConfig.name}` };
}
