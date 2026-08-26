import { DocumentModel, PERM, ProblemModel, UserModel } from 'hydrooj';
import {
  isRolloutAllowed,
  resolveAcmBankPolicy,
} from '../shared/acm/acm-bank-policy';
import type {
  ACMAssistantPermissionContext,
  ACMAssistantEligibilityResult,
} from '../shared/acm/acm-assistant.types';

function isObjectiveProblem(pdoc: { config?: unknown } | null): boolean {
  if (!pdoc?.config || typeof pdoc.config !== 'object') return false;
  const cfg = pdoc.config as Record<string, unknown>;
  return cfg.type === 'objective' || cfg.objective === true;
}

/**
 * FishOJ 简化版：无 AntiCrawl / ProblemSet / CodeNote 可见性 / VIP 题解权限。
 * 登录 + 可看题即可用助教；官方题解能力关闭。
 */
export async function resolveAcmAssistantAccess(input: {
  domainId: string;
  viewerUid: number;
  pid: string;
  docId?: number;
  tid?: number | string;
  activeProblemSetId?: string;
  antiCrawlBanned?: boolean;
  antiCrawlLimited?: boolean;
}): Promise<{
  permissions: ACMAssistantPermissionContext;
  policy: ReturnType<typeof resolveAcmBankPolicy>;
  psid: string;
  bankType: string;
  pdoc: any;
}> {
  const uid = Number(input.viewerUid || 0);
  const authenticated = uid > 0;
  const denied: ACMAssistantPermissionContext['deniedReasons'] = [];

  const tidRaw = input.tid != null && String(input.tid).trim() !== '' ? input.tid : null;
  if (tidRaw != null) {
    try {
      const tidNum = Number(tidRaw);
      const tidKey = Number.isFinite(tidNum) ? tidNum : tidRaw;
      const tdoc = await DocumentModel.get(input.domainId, DocumentModel.TYPE_CONTEST, tidKey as any);
      if (tdoc) {
        denied.push('CONTEST_NO_AI');
        return buildDenied('CONTEST_NO_AI', authenticated, denied, input, null);
      }
    } catch (e: any) {
      console.log('[AcmAssistantAccess] contest check failed:', e?.message);
    }
  }

  const pdoc = await ProblemModel.get(input.domainId, input.pid);
  if (!pdoc) {
    return buildDenied('PROBLEM_ACCESS_DENIED', authenticated, denied, input, null);
  }

  const psid = String(input.activeProblemSetId || '').trim();
  const bankType = 'default';
  const policy = resolveAcmBankPolicy({
    problemSetId: psid || undefined,
    bankType,
  });

  // FishOJ：默认题库策略强制不要求题库权益
  policy.access.requireBankEntitlement = false;
  policy.features.officialSolutionQuery = false;
  policy.features.quotaDisplay = false;

  if (!policy.enabled) {
    denied.push('BANK_DISABLED');
    return buildDenied('BANK_DISABLED', authenticated, denied, input, pdoc, policy, psid, bankType);
  }

  if (!isRolloutAllowed(policy, String(pdoc.pid || input.pid))) {
    denied.push('CAPABILITY_DISABLED');
    return buildDenied('CAPABILITY_DISABLED', authenticated, denied, input, pdoc, policy, psid, bankType);
  }

  if (isObjectiveProblem(pdoc)) {
    denied.push('NOT_ACM_PROBLEM');
    return buildDenied('NOT_ACM_PROBLEM', authenticated, denied, input, pdoc, policy, psid, bankType);
  }

  if (policy.access.requireLogin && !authenticated) {
    denied.push('LOGIN_REQUIRED');
    return buildDenied('LOGIN_REQUIRED', authenticated, denied, input, pdoc, policy, psid, bankType);
  }

  const udoc = authenticated ? await UserModel.getById(input.domainId, uid) : null;
  const canViewProblem = Boolean(
    authenticated
    && udoc
    && ProblemModel.canViewBy(pdoc, udoc)
    && udoc.hasPerm(PERM.PERM_VIEW_PROBLEM),
  );

  if (policy.access.requireProblemViewPermission && !canViewProblem) {
    denied.push('PROBLEM_ACCESS_DENIED');
    return buildDenied('PROBLEM_ACCESS_DENIED', authenticated, denied, input, pdoc, policy, psid, bankType);
  }

  const canReadStatement = canViewProblem;
  const bankUnlocked = true;
  const antiCrawlAllowed = !(input.antiCrawlBanned || input.antiCrawlLimited);
  if (!antiCrawlAllowed) denied.push('ANTI_CRAWL_BLOCKED');

  const canAccessAssistant = policy.enabled
    && canViewProblem
    && canReadStatement
    && bankUnlocked
    && antiCrawlAllowed
    && authenticated;

  const permissions: ACMAssistantPermissionContext = {
    authenticated,
    resource: {
      canAccessAssistant,
      canViewProblem,
      canReadStatement,
      bankEnabled: policy.enabled,
      bankUnlocked,
      antiCrawlAllowed,
    },
    capabilities: {
      canChat: canAccessAssistant && policy.features.chat,
      canReadCode: canAccessAssistant && policy.features.codeContext,
      canReadCustomTest: canAccessAssistant && policy.features.customTestContext,
      canReadOwnRunResult: canAccessAssistant && policy.features.runResultQuery,
      canReadOwnConsoleOutput: canAccessAssistant && policy.features.consoleQuery,
      canReadOwnSubmissions: canAccessAssistant && policy.features.submissionHistoryQuery,
      canReadOwnSubmissionCode: canAccessAssistant && policy.features.submissionHistoryQuery,
      canReadOfficialSolution: false,
      canSwitchLanguage: canAccessAssistant && policy.features.languageSync,
      canUseHistory: canAccessAssistant && policy.features.history,
      canUseDeepThinking: canAccessAssistant && policy.features.deepThinking,
    },
    ...(denied.length ? { deniedReasons: denied } : {}),
  };

  return { permissions, policy, psid, bankType, pdoc };
}

function buildDenied(
  _reason: string,
  authenticated: boolean,
  denied: ACMAssistantPermissionContext['deniedReasons'],
  input: { domainId: string; pid: string },
  pdoc: any,
  policy?: ReturnType<typeof resolveAcmBankPolicy>,
  psid = '',
  bankType = 'default',
) {
  const permissions: ACMAssistantPermissionContext = {
    authenticated,
    resource: {
      canAccessAssistant: false,
      canViewProblem: false,
      canReadStatement: false,
      bankEnabled: policy?.enabled ?? false,
      bankUnlocked: false,
      antiCrawlAllowed: !(input as any).antiCrawlBanned,
    },
    capabilities: {
      canChat: false,
      canReadCode: false,
      canReadCustomTest: false,
      canReadOwnRunResult: false,
      canReadOwnConsoleOutput: false,
      canReadOwnSubmissions: false,
      canReadOwnSubmissionCode: false,
      canReadOfficialSolution: false,
      canSwitchLanguage: false,
      canUseHistory: false,
      canUseDeepThinking: false,
    },
    deniedReasons: denied,
  };
  return { permissions, policy: policy || resolveAcmBankPolicy({ bankType }), psid, bankType, pdoc };
}

export function checkAcmAssistantEligibility(input: {
  isObjective?: boolean;
  assistantDisabled?: boolean;
  loginRequired?: boolean;
  antiCrawlBanned?: boolean;
  permissions?: ACMAssistantPermissionContext;
}): ACMAssistantEligibilityResult {
  if (input.isObjective) return { eligible: false, reason: 'OBJECTIVE_PROBLEM' };
  if (input.assistantDisabled) return { eligible: false, reason: 'ASSISTANT_DISABLED' };
  if (input.antiCrawlBanned) return { eligible: false, reason: 'ANTI_CRAWL_BLOCKED' };
  if (input.loginRequired) return { eligible: false, reason: 'PROBLEM_ACCESS_DENIED' };
  const p = input.permissions;
  if (!p?.resource.canAccessAssistant) {
    if (p?.deniedReasons?.includes('CONTEST_NO_AI')) return { eligible: false, reason: 'CONTEST_NO_AI' };
    if (p?.deniedReasons?.includes('ANTI_CRAWL_BLOCKED')) return { eligible: false, reason: 'ANTI_CRAWL_BLOCKED' };
    return { eligible: false, reason: 'PROBLEM_ACCESS_DENIED' };
  }
  return { eligible: true };
}
