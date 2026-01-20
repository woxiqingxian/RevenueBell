/**
 * Apple App Store Server Notifications V2 事件类型映射表
 *
 * 文档参考：
 * - https://developer.apple.com/documentation/appstoreservernotifications/notificationtype
 * - https://developer.apple.com/documentation/appstoreservernotifications/subtype
 */

const EVENT_MAP = {
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

/**
 * 获取事件配置
 * @param {string} type - notificationType
 * @param {string} subtype - subtype (可选)
 * @returns {{ name: string, category: string, emoji: string } | null}
 */
export function getEventConfig(type, subtype) {
  const key = `${type}|${subtype || ''}`;
  const keyTypeOnly = `${type}|`;

  if (EVENT_MAP[key]) return EVENT_MAP[key];
  if (EVENT_MAP[keyTypeOnly]) return EVENT_MAP[keyTypeOnly];
  return null;
}
