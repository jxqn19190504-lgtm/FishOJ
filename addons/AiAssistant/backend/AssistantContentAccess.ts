/**
 * AI 助教全局内容权限门禁。
 * 规则：用户页面上无权看到的内容，不得进入 AI 上下文；无权使用助教时直接拒绝。
 */

export type AssistantAccessDenyCode =
  | 'LOGIN_REQUIRED'
  | 'BANK_LOCKED'
  | 'PROBLEM_LOCKED'
  | 'PROBLEM_ACCESS_DENIED'
  | 'DISABLED'
  | 'CAPABILITY_DISABLED'
  | 'BANK_DISABLED'
  | 'NOT_ACM_PROBLEM'
  | 'ANTI_CRAWL_BLOCKED'
  | 'CONTEST_NO_AI';

const DENY_MESSAGES: Record<AssistantAccessDenyCode, string> = {
  LOGIN_REQUIRED: '请先登录后再使用 AI 助教',
  BANK_LOCKED: '解锁当前题库后可使用 AI 助教',
  PROBLEM_LOCKED: '当前题面暂不可访问，AI 助教不可用',
  PROBLEM_ACCESS_DENIED: '当前无法使用 AI 助教',
  DISABLED: 'AI 助教功能暂未开放',
  CAPABILITY_DISABLED: '当前题目暂未开放 AI 助教',
  BANK_DISABLED: '当前题库未开放 AI 助教',
  NOT_ACM_PROBLEM: '当前题型不支持 AI 助教',
  ANTI_CRAWL_BLOCKED: '当前访问受限，暂无法使用 AI 助教',
  CONTEST_NO_AI: '竞赛模式下暂不可用 AI 助教',
};

export function assistantAccessDeniedMessage(code: AssistantAccessDenyCode | string): string {
  const key = String(code || '') as AssistantAccessDenyCode;
  return DENY_MESSAGES[key] || DENY_MESSAGES.PROBLEM_ACCESS_DENIED;
}

export function throwAssistantAccessDenied(code: AssistantAccessDenyCode | string): never {
  const normalized = (String(code || 'PROBLEM_ACCESS_DENIED') || 'PROBLEM_ACCESS_DENIED') as AssistantAccessDenyCode;
  throw Object.assign(new Error(assistantAccessDeniedMessage(normalized)), { code: normalized });
}

/** Hot100 / CodeNote 页面内容访问能力（与页面 isReadLimited / 题解可见性对齐） */
export type Hot100ContentAccess = {
  authenticated: boolean;
  hasPsPerm: boolean;
  canViewByVisibility: boolean;
  /** 与页面 bodyReadLimited 一致 */
  isReadLimited: boolean;
  /** 可注入题面/笔记正文与划词引用 */
  canReadStatement: boolean;
  /** 可注入题解 */
  canSeeSolution: boolean;
  /** 可使用助教（登录且可读正文） */
  canAccessAssistant: boolean;
  deniedReason?: AssistantAccessDenyCode;
};

export function resolveHot100ContentAccess(input: {
  viewerUid: number;
  hasPsPerm: boolean;
  canViewByVisibility: boolean;
  /** 题库设置：未登录访客可看全文 */
  guestFullAccess: boolean;
  isIntroPage: boolean;
  mode: 'learning' | 'practice';
}): Hot100ContentAccess {
  const authenticated = Number(input.viewerUid || 0) > 0;
  const guestFull = Boolean(input.guestFullAccess) && !authenticated;

  // 与 CodeNote 页面一致：
  // - 介绍页：已登录可读全文（不因题库购买截断）；访客仅在 guestFull 时全文
  // - 普通题：无题库权限则阅读受限；管理员题面锁定优先
  let isReadLimited: boolean;
  if (input.isIntroPage) {
    isReadLimited = !authenticated && !guestFull;
  } else {
    isReadLimited = !input.hasPsPerm && !guestFull;
  }
  if (!input.canViewByVisibility) isReadLimited = true;

  const canReadStatement = !isReadLimited;
  const canSeeSolution = !input.isIntroPage
    && input.mode === 'learning'
    && canReadStatement;

  let deniedReason: AssistantAccessDenyCode | undefined;
  if (!authenticated) deniedReason = 'LOGIN_REQUIRED';
  else if (!input.canViewByVisibility) deniedReason = 'PROBLEM_LOCKED';
  else if (isReadLimited) deniedReason = 'BANK_LOCKED';

  const canAccessAssistant = authenticated && canReadStatement;

  return {
    authenticated,
    hasPsPerm: Boolean(input.hasPsPerm),
    canViewByVisibility: Boolean(input.canViewByVisibility),
    isReadLimited,
    canReadStatement,
    canSeeSolution,
    canAccessAssistant,
    ...(deniedReason ? { deniedReason } : {}),
  };
}

/** 断言可使用助教；失败时抛出带 code 的 Error */
export function assertAssistantContentAccess(access: Pick<Hot100ContentAccess, 'canAccessAssistant' | 'deniedReason'>): void {
  if (access.canAccessAssistant) return;
  throwAssistantAccessDenied(access.deniedReason || 'PROBLEM_ACCESS_DENIED');
}
