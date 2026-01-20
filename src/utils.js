/**
 * 工具函数集合
 */

// ==================== JWS 解码 ====================

/**
 * 解码 JWS (JSON Web Signature) token
 * @param {string} token - JWS token
 * @returns {object|null} 解码后的 payload 或 null
 */
export function decodeJWS(token) {
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

// ==================== 格式化函数 ====================

/**
 * 解析 ISO 8601 duration 格式的优惠时长
 * P1D=1天, P7D=7天, P1W=1周, P1M=1个月, P3M=3个月, P1Y=1年
 * @param {string} period - ISO 8601 duration 字符串
 * @returns {string|null} 中文格式的时长
 */
export function parseOfferPeriod(period) {
  if (!period) return null;
  const match = period.match(/^P(\d+)([DWMY])$/);
  if (!match) return period;
  const [, num, unit] = match;
  const units = { D: '天', W: '周', M: '个月', Y: '年' };
  return `${num}${units[unit] || unit}`;
}

/**
 * 格式化价格（毫单位转换）
 * @param {number} price - 价格（毫单位）
 * @param {string} currency - ISO 4217 货币代码
 * @returns {string|null} 格式化后的价格字符串
 */
export function formatPrice(price, currency) {
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

// ==================== 通知发送 ====================

/**
 * 发送 Bark 推送通知
 * @param {string} key - Bark Key
 * @param {string} title - 通知标题
 * @param {string} body - 通知内容
 * @param {object} options - 可选配置 { icon, sound, group }
 */
export async function sendBarkNotification(key, title, body, options = {}) {
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

/**
 * 转发通知到其他服务
 * @param {string} url - 目标 URL
 * @param {object} data - 原始通知数据
 */
export async function forwardNotification(url, data) {
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
    throw e;
  }
}

// ==================== 辅助函数 ====================

/**
 * 深度合并对象
 * @param {object} target - 目标对象
 * @param {object} source - 源对象
 * @returns {object} 合并后的对象
 */
export function deepMerge(target, source) {
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
 * 掩码 Bark Key（只显示前4位和后4位）
 * @param {string} key - Bark Key
 * @returns {string} 掩码后的 Key
 */
export function maskBarkKey(key) {
  if (!key || key.length <= 8) return "****";
  const start = key.substring(0, 4);
  const end = key.substring(key.length - 4);
  return `${start}****${end}`;
}

/**
 * 掩码 URL（只显示域名）
 * @param {string} url - URL
 * @returns {string} 掩码后的 URL
 */
export function maskUrl(url) {
  if (!url) return "";
  try {
    const urlObj = new URL(url);
    const hasPaths = urlObj.pathname && urlObj.pathname !== '/';
    return urlObj.hostname + (hasPaths ? '/****' : '');
  } catch (e) {
    return url.length > 20 ? url.substring(0, 20) + "..." : url;
  }
}
