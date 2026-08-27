import type { AssistantLanguageOption, AssistantPageContext } from '../../../shared/assistant-config.types';
import { resolveNativeLanguageKey } from '../../../shared/assistant-code-language';
import { isAssistantDeepThinkEnabled } from '../../core/AssistantDeepThink';
import type { AIAssistantAdapter } from '../adapter.types';
import {
  buildAcmClientSnapshot,
  dispatchIdeLanguageChange,
  ensureFishOjProblemIdeBridge,
  getProblemIdeAssistantBridge,
  isAcmAssistantEligibleOnPage,
  readAcmProblemIdFromPage,
  readAcmStatementFromUiContext,
  readAcmUiFlags,
} from './problemIdeAssistantBridge';

export type CreateAcmProblemAdapterOptions = {
  problemId: string;
};

export function createAcmProblemAssistantAdapter(
  options: CreateAcmProblemAdapterOptions,
): AIAssistantAdapter {
  const problemId = options.problemId;
  ensureFishOjProblemIdeBridge();

  const adapter: AIAssistantAdapter = {
    getScene: () => 'acm-problem',
    getResourceId: () => problemId,

    getContext: (): AssistantPageContext => {
      const parsed = readAcmStatementFromUiContext();
      let title = problemId;
      try {
        const t = (typeof UiContext !== 'undefined' && UiContext.pdoc?.title)
          ? String(UiContext.pdoc.title)
          : '';
        if (t.trim()) title = t.trim();
      } catch {
        /* ignore */
      }
      const bridge = getProblemIdeAssistantBridge();
      return {
        scene: 'acm-problem',
        resourceId: problemId,
        title,
        description: parsed?.description,
        inputFormat: parsed?.inputDescription,
        outputFormat: parsed?.outputDescription,
        constraints: parsed?.dataRangeText ? [parsed.dataRangeText] : undefined,
        examples: parsed?.examples?.map((ex) => ({
          input: ex.input,
          output: ex.output,
          explanation: ex.explanation,
        })),
        language: bridge?.getLanguage(),
        code: bridge?.getCode(),
      };
    },

    getClientContext: () => {
      const bridge = getProblemIdeAssistantBridge();
      const snapshot = buildAcmClientSnapshot(problemId);
      return {
        abbreviation: 'acm',
        pid: problemId,
        mode: 'learning',
        scene: 'acm-problem',
        codeLanguage: bridge?.getLanguage(),
        acmSnapshot: snapshot,
        ...(isAssistantDeepThinkEnabled() ? { deepThink: true } : {}),
      };
    },

    getCurrentLanguage: () => getProblemIdeAssistantBridge()?.getLanguage(),
    getSupportedLanguages: (): AssistantLanguageOption[] => {
      const bridge = getProblemIdeAssistantBridge();
      return bridge?.getSupportedLanguages().map((l) => ({
        label: l.label,
        value: l.value,
      })) || [];
    },
    changeLanguage: (lang: string) => {
      const bridge = getProblemIdeAssistantBridge();
      if (!bridge) return;
      const supported = bridge.getSupportedLanguages().map((l) => l.value);
      const current = bridge.getLanguage();
      const target = resolveNativeLanguageKey(lang, supported, current);
      if (!target) return;
      if (current === target) return;
      bridge.setLanguage(target);
      dispatchIdeLanguageChange(target);
    },
    getCurrentCode: () => getProblemIdeAssistantBridge()?.getCode(),

    getSelectableRoot: () => document.getElementById('problemIdeProblemContent'),

    isSelectionAllowed: (range: Range) => {
      const root = document.getElementById('problemIdeProblemContent');
      if (!root) return false;
      return root.contains(range.startContainer) && root.contains(range.endContainer);
    },

    subscribeContextChange: (callback) => {
      const onLang = (ev: Event) => {
        const lang = (ev as CustomEvent).detail?.lang;
        if (lang) callback(adapter.getContext());
      };
      const onIde = () => callback(adapter.getContext());
      window.addEventListener('codenote:codeLanguageChanged', onLang);
      document.addEventListener('problem-ide-code-change', onIde);
      document.addEventListener('problem-ide-run-result', onIde);
      document.addEventListener('problem-ide-ready', onIde);
      return () => {
        window.removeEventListener('codenote:codeLanguageChanged', onLang);
        document.removeEventListener('problem-ide-code-change', onIde);
        document.removeEventListener('problem-ide-run-result', onIde);
        document.removeEventListener('problem-ide-ready', onIde);
      };
    },

    isAccessAllowed: () => checkAcmRouteEligibility(),

    getAccessNotice: () => {
      const flags = readAcmUiFlags();
      if (flags.loginRequired) return '登录后即可使用 AI 助教解答本题。';
      if (flags.contestNoAi) return '竞赛模式下暂不可用 AI 助教。';
      return undefined;
    },
  };

  return adapter;
}

export function checkAcmRouteEligibility(): boolean {
  if (!readAcmProblemIdFromPage()) return false;
  return isAcmAssistantEligibleOnPage();
}

declare const UiContext: {
  pdoc?: { title?: string; content?: unknown };
};
