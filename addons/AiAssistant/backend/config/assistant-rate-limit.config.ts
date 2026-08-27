/** 集中配置：统一接口限频（2026-07-24 拍板） */
export const ASSISTANT_RATE_LIMIT = {
  /** 单用户每分钟最多请求次数 */
  uidPerMinute: 10,
  /** 单 IP 每分钟最多请求次数 */
  ipPerMinute: 30,
  /** 单用户同时只允许 1 个生成中请求 */
  maxConcurrentPerUid: 1,
  /** 60 秒内连续本地无关命中次数 → 触发冷却 */
  unrelatedHitsBeforeCooldown: 5,
  /** 无关规则冷却窗口（毫秒） */
  unrelatedHitWindowMs: 60_000,
  /** 无关规则冷却时长（毫秒） */
  unrelatedCooldownMs: 60_000,
  /** 滑动窗口长度（毫秒） */
  requestWindowMs: 60_000,
} as const;
