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
export const PRODUCT_NAME = "iRich"; // 提示：替换为你的产品名称
export const BARK_KEY = ""; // ⚠️ 替换为你的 Key
export const BARK_ICON = ""; // 可选：默认图标 URL
export const ENABLE_SANDBOX_NOTIFICATIONS = false; // 是否推送 Sandbox 测试环境的通知
export const FORWARD_URL = ""; // 可选：转发通知到其他服务的 URL

/**
 * 通知类型配置 - 默认值
 * 每个类别可单独配置: enabled(开关), icon(图标), sound(声音), group(分组)
 * 环境变量 NOTIFICATION_CONFIG 可覆盖，格式为 JSON 字符串
 */
export const NOTIFICATION_CONFIG = {
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

import { deepMerge } from './utils.js';

/**
 * 获取通知配置（合并环境变量覆盖）
 */
export function getNotificationConfig(env) {
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
