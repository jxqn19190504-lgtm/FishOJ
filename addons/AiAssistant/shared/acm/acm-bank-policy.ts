import type { ACMProblemBankAssistantPolicy } from './acm-assistant.types';

export const defaultACMAssistantPolicy: ACMProblemBankAssistantPolicy = {
  id: 'default-acm-assistant',
  enabled: true,
  bankType: 'default',
  rollout: { mode: 'all' },
  access: {
    requireLogin: true,
    requireProblemViewPermission: true,
    requireBankEntitlement: false,
    hideWhenDenied: true,
  },
  features: {
    chat: true,
    streaming: true,
    history: true,
    recommendedQuestions: true,
    followUpQuestions: true,
    deepThinking: true,
    quotaDisplay: true,
    problemContext: true,
    codeContext: true,
    customTestContext: true,
    languageSelector: true,
    languageSync: true,
    runResultQuery: true,
    consoleQuery: true,
    submissionHistoryQuery: true,
    officialSolutionQuery: true,
  },
};

export function resolveAcmBankPolicy(input: {
  problemSetId?: string;
  problemSetAbbr?: string;
  bankType?: string;
}): ACMProblemBankAssistantPolicy {
  const abbr = String(input.problemSetAbbr || '').trim().toLowerCase();
  const bankType = String(input.bankType || '').trim();

  if (bankType === 'interview-bank' || abbr === 'interview' || abbr.includes('interview')) {
    return {
      ...defaultACMAssistantPolicy,
      id: 'interview-bank-acm-assistant',
      bankType: 'interview-bank',
      problemSetId: input.problemSetId,
      problemSetAbbr: input.problemSetAbbr,
      access: {
        ...defaultACMAssistantPolicy.access,
        requireBankEntitlement: true,
      },
    };
  }

  if (bankType === 'problem-bank' || abbr === 'hot100' || abbr === 'pset') {
    return {
      ...defaultACMAssistantPolicy,
      id: 'paid-problem-bank-acm-assistant',
      bankType: 'problem-bank',
      problemSetId: input.problemSetId,
      problemSetAbbr: input.problemSetAbbr,
      access: {
        ...defaultACMAssistantPolicy.access,
        requireBankEntitlement: true,
      },
    };
  }

  return {
    ...defaultACMAssistantPolicy,
    problemSetId: input.problemSetId,
    problemSetAbbr: input.problemSetAbbr,
  };
}

export function isRolloutAllowed(
  policy: ACMProblemBankAssistantPolicy,
  pid: string,
): boolean {
  const id = String(pid || '').trim();
  if (!id) return false;
  const { mode, problemIds = [] } = policy.rollout;
  if (mode === 'all') return true;
  const set = new Set(problemIds.map((x) => String(x).trim()));
  if (mode === 'allowlist') return set.has(id);
  if (mode === 'denylist') return !set.has(id);
  return true;
}
