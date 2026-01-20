/**
 * 配置区域 - 默认值
 *
 * 环境变量配置：
 * - APPS: 应用列表，逗号分隔，如 "irich,ifocus"
 *
 * - 每个应用的配置（{KEY}_{appname} 格式）：
 *   - PRODUCT_NAME_appname: 产品名称
 *   - BARK_KEY_appname: Bark 推送 Key（可选，默认使用全局 BARK_KEY）
 *   - BARK_ICON_appname: 通知图标 URL
 *   - FORWARD_URL_appname: 转发 URL
 *   - ENABLE_SANDBOX_appname: 测试环境开关 ("true" 或 "false")
 *
 * - 全局配置：
 *   - BARK_KEY: 全局 Bark Key（所有应用共用）
 *   - NOTIFICATION_CONFIG: 全局通知类型配置 (JSON 字符串)
 *   - BARK_SOUND: 默认提示音（作为保底）
 *   - BARK_SOUND_REVENUE: 收入通知提示音
 *   - BARK_SOUND_REFUND: 退款通知提示音
 *   - BARK_SOUND_RISK: 风险预警提示音
 *   - BARK_SOUND_STATUS: 状态变更提示音
 */

import { deepMerge } from './src/utils.js';

// ==================== 默认配置 ====================

export const DEFAULT_APP_CONFIG = {
  productName: "My App",
  barkKey: "",
  barkIcon: "",
  forwardUrl: "",
  enableSandbox: false
};

export const DEFAULT_NOTIFICATION_CONFIG = {
  REVENUE: {
    enabled: true,
    icon: "",
    sound: "calypso",
    group: "Revenue"
  },
  REFUND: {
    enabled: false,
    icon: "",
    sound: "minuet",
    group: "Refund"
  },
  RISK: {
    enabled: false,
    icon: "",
    sound: "chord",
    group: "Risk"
  },
  STATUS: {
    enabled: false,
    icon: "",
    sound: "popcorn",
    group: "Status"
  }
};

// ==================== 配置读取函数 ====================

/**
 * 获取应用列表
 * @param {object} env - 环境变量
 * @returns {string[]} 应用名称数组
 */
export function getAppList(env) {
  if (env?.APPS) {
    return env.APPS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

/**
 * 获取指定应用的配置
 * @param {string} appName - 应用名称
 * @param {object} env - 环境变量
 * @returns {object|null} 应用配置，不存在返回 null
 */
export function getAppConfig(appName, env) {
  const appList = getAppList(env);

  if (!appList.includes(appName.toLowerCase())) {
    return null;
  }

  // 从环境变量读取（支持小写和大写 appname）
  const getEnvVar = (prefix) => {
    return env?.[`${prefix}_${appName}`] || env?.[`${prefix}_${appName.toUpperCase()}`];
  };

  const result = {
    productName: getEnvVar('PRODUCT_NAME') || appName,
    // BARK_KEY: 先找 BARK_KEY_appname，再找全局 BARK_KEY
    barkKey: getEnvVar('BARK_KEY') || env?.BARK_KEY || DEFAULT_APP_CONFIG.barkKey,
    barkIcon: getEnvVar('BARK_ICON') || DEFAULT_APP_CONFIG.barkIcon,
    forwardUrl: getEnvVar('FORWARD_URL') || DEFAULT_APP_CONFIG.forwardUrl,
    enableSandbox: getEnvVar('ENABLE_SANDBOX') === "true",
    notifications: getNotificationConfig(null, env)
  };

  return result;
}

/**
 * 获取所有应用配置（用于列表展示）
 * @param {object} env - 环境变量
 * @returns {object} { appName: { productName, ... }, ... }
 */
export function getAppsConfig(env) {
  const appList = getAppList(env);
  const result = {};

  for (const appName of appList) {
    result[appName] = getAppConfig(appName, env);
  }

  return result;
}

/**
 * 获取通知配置（合并默认值）
 * @param {object} appNotifications - 应用级通知配置
 * @param {object} env - 环境变量
 * @returns {object} 合并后的通知配置
 */
export function getNotificationConfig(appNotifications, env) {
  let config = { ...DEFAULT_NOTIFICATION_CONFIG };

  // 先合并全局环境变量配置
  if (env?.NOTIFICATION_CONFIG) {
    try {
      const envConfig = JSON.parse(env.NOTIFICATION_CONFIG);
      config = deepMerge(config, envConfig);
    } catch (e) {
      console.error("NOTIFICATION_CONFIG parse error:", e);
    }
  }

  // 再合并应用级配置
  if (appNotifications) {
    config = deepMerge(config, appNotifications);
  }

  // 最后处理 BARK_SOUND 环境变量（优先级最高）
  // BARK_SOUND_xxx 覆盖特定类别，BARK_SOUND 作为默认保底
  const defaultSound = env?.BARK_SOUND;
  const categories = ['REVENUE', 'REFUND', 'RISK', 'STATUS'];

  for (const category of categories) {
    const categorySound = env?.[`BARK_SOUND_${category}`];
    if (categorySound) {
      config[category].sound = categorySound;
    } else if (defaultSound) {
      config[category].sound = defaultSound;
    }
  }

  return config;
}
