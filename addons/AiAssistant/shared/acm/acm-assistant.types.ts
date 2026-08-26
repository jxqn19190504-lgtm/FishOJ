/** ACM IDE 题目 AI 助教 — 前后端共享类型 */

export type ACMAssistantDeniedReason =
  | 'LOGIN_REQUIRED'
  | 'PROBLEM_ACCESS_DENIED'
  | 'BANK_DISABLED'
  | 'BANK_LOCKED'
  | 'PROBLEM_LOCKED'
  | 'ANTI_CRAWL_BLOCKED'
  | 'CONTEST_NO_AI'
  | 'CAPABILITY_DISABLED'
  | 'MEMBERSHIP_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'QUOTA_EXHAUSTED'
  | 'NOT_ACM_PROBLEM'
  | 'OBJECTIVE_PROBLEM'
  | 'ASSISTANT_DISABLED';

export interface ACMAssistantPermissionContext {
  authenticated: boolean;
  resource: {
    canAccessAssistant: boolean;
    canViewProblem: boolean;
    canReadStatement: boolean;
    bankEnabled: boolean;
    bankUnlocked: boolean;
    antiCrawlAllowed: boolean;
  };
  capabilities: {
    canChat: boolean;
    canReadCode: boolean;
    canReadCustomTest: boolean;
    canReadOwnRunResult: boolean;
    canReadOwnConsoleOutput: boolean;
    canReadOwnSubmissions: boolean;
    canReadOwnSubmissionCode: boolean;
    canReadOfficialSolution: boolean;
    canSwitchLanguage: boolean;
    canUseHistory: boolean;
    canUseDeepThinking: boolean;
  };
  deniedReasons?: ACMAssistantDeniedReason[];
}

export interface ACMProblemExample {
  index: number;
  input?: string;
  output?: string;
  explanation?: string;
}

export interface ACMProblemImage {
  url: string;
  alt?: string;
  caption?: string;
  order: number;
  sourceSection: 'description' | 'input' | 'output' | 'example' | 'data-range' | 'other';
}

export interface ACMIDEContextSnapshot {
  language?: string;
  supportedLanguages?: Array<{ label: string; value: string }>;
  code?: string;
  customTestInput?: string;
}

export interface ACMRuntimeContextSnapshot {
  latestRunId?: string;
  /** pretest=自测；submission=正式提交 */
  runKind?: 'pretest' | 'submission';
  status?: string;
  /** 中文状态，可选；服务端也会再格式化 */
  statusLabel?: string;
  score?: number;
  compilerOutput?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  timeUsed?: number;
  memoryUsed?: number;
}

/** 前端随 stream 请求携带的最小 ACM 快照（服务端仍会做权限校验与题面重建） */
export interface ACMAssistantClientSnapshot {
  domainId?: string;
  docId?: number;
  /** 竞赛 tid；服务端据此校验 TYPE_CONTEST 禁 AI（勿仅信前端 flag） */
  tid?: number | string;
  bankType?: string;
  problemSetId?: string;
  problemSetAbbr?: string;
  /** @deprecated 服务端以 AntiCrawlBanModel 为准，客户端字段仅作辅助 */
  antiCrawlBanned?: boolean;
  /** @deprecated 同上 */
  antiCrawlLimited?: boolean;
  ide?: ACMIDEContextSnapshot;
  runtime?: ACMRuntimeContextSnapshot;
  permissionsSummary?: Pick<ACMAssistantPermissionContext, 'resource' | 'capabilities'>;
}

export interface ACMProblemBankAssistantPolicy {
  id: string;
  enabled: boolean;
  bankType: 'default' | 'problem-bank' | 'interview-bank' | string;
  problemSetId?: string;
  problemSetAbbr?: string;
  rollout: {
    mode: 'all' | 'allowlist' | 'denylist';
    problemIds?: string[];
  };
  access: {
    requireLogin: boolean;
    requireProblemViewPermission: boolean;
    requireBankEntitlement: boolean;
    hideWhenDenied: boolean;
  };
  features: {
    chat: boolean;
    streaming: boolean;
    history: boolean;
    recommendedQuestions: boolean;
    followUpQuestions: boolean;
    deepThinking: boolean;
    quotaDisplay: boolean;
    problemContext: boolean;
    codeContext: boolean;
    customTestContext: boolean;
    languageSelector: boolean;
    languageSync: boolean;
    runResultQuery: boolean;
    consoleQuery: boolean;
    submissionHistoryQuery: boolean;
    officialSolutionQuery: boolean;
  };
}

export type ACMAssistantEligibilityReason =
  | 'NOT_ACM_PROBLEM'
  | 'OBJECTIVE_PROBLEM'
  | 'ASSISTANT_DISABLED'
  | 'BANK_DISABLED'
  | 'BANK_LOCKED'
  | 'PROBLEM_ACCESS_DENIED'
  | 'ANTI_CRAWL_BLOCKED'
  | 'CONTEST_NO_AI';

export interface ACMAssistantEligibilityResult {
  eligible: boolean;
  reason?: ACMAssistantEligibilityReason;
}
