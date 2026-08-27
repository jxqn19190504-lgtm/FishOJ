import { CODENOTE_IDE_LANGUAGE_EVENT } from '../ide-language-events';
import type { ACMAssistantClientSnapshot } from '../../../shared/acm/acm-assistant.types';
import {
  extractZhContentFromProblemContent,
  parseAcmStatementContent,
} from '../../../shared/acm/acm-statement-parser';

/**
 * FishOJ：不修改 ProblemIde 内部；用 window.FishOJProblemIde + CustomEvent 适配。
 */
export type ProblemIdeAssistantBridge = {
  getLanguage(): string;
  getSupportedLanguages(): Array<{ label: string; value: string }>;
  setLanguage(lang: string): void;
  getCode(): string;
  getCustomTestInput(): string;
  getLatestRuntime?(): ACMAssistantClientSnapshot['runtime'];
  isEligible?(): boolean;
  getBankContext?(): { problemSetId?: string; problemSetAbbr?: string; bankType?: string };
};

const BRIDGE_KEY = '__fishojProblemIdeAssistantBridge';

export function setProblemIdeAssistantBridge(bridge: ProblemIdeAssistantBridge | null): void {
  (window as Window & { [BRIDGE_KEY]?: ProblemIdeAssistantBridge | null })[BRIDGE_KEY] = bridge;
}

export function getProblemIdeAssistantBridge(): ProblemIdeAssistantBridge | null {
  return (window as Window & { [BRIDGE_KEY]?: ProblemIdeAssistantBridge | null })[BRIDGE_KEY] || null;
}

declare const UiContext: {
  domainId?: string;
  problemId?: string;
  problemNumId?: number;
  pdoc?: {
    title?: string;
    content?: unknown;
    docId?: number;
    config?: unknown;
    alg_tag?: string[];
  };
  problemIdeLoginRequired?: boolean;
  problemIdeHost?: {
    pid?: string;
    docId?: number;
    domainId?: string;
    title?: string;
  };
  learning?: {
    assistantEnabled?: boolean;
  };
  aiAssistant?: {
    enabled?: boolean;
  };
  tdoc?: { docId?: number | string };
};

declare global {
  interface Window {
    FishOJProblemIde?: {
      getSnapshot: () => {
        pid: string;
        language: string;
        code: string;
        cases: Array<{ input: string; expected: string }>;
        lastRun?: {
          type?: string;
          input?: string;
          expected?: string;
          stdout?: string;
          stderr?: string;
          status?: string;
          time?: number;
          memory?: number;
        };
      };
      hasMeaningfulCode?: () => boolean;
    };
    __problemIdeLangRange?: Record<string, string>;
    __problemIdeConfig?: Record<string, unknown>;
  }
}

/** 从 FishOJProblemIde 快照与 DOM 合成 bridge（可重复调用） */
export function ensureFishOjProblemIdeBridge(): ProblemIdeAssistantBridge {
  const existing = getProblemIdeAssistantBridge();
  if (existing) return existing;

  const langEl = () => document.getElementById('problemIdeLang') as HTMLSelectElement | null;
  const inputEl = () => document.getElementById('problemIdeInput') as HTMLTextAreaElement | null;

  const bridge: ProblemIdeAssistantBridge = {
    getLanguage: () => {
      const snap = window.FishOJProblemIde?.getSnapshot?.();
      if (snap?.language) return snap.language;
      return langEl()?.value || 'cc';
    },
    getSupportedLanguages: () => {
      const range = window.__problemIdeLangRange || {};
      const keys = Object.keys(range);
      if (keys.length) {
        return keys.map((value) => ({ label: range[value] || value, value }));
      }
      const sel = langEl();
      if (!sel) return [];
      return Array.from(sel.options).map((o) => ({ label: o.textContent || o.value, value: o.value }));
    },
    setLanguage: (lang: string) => {
      const sel = langEl();
      if (!sel) return;
      if (sel.value === lang) return;
      sel.value = lang;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    },
    getCode: () => {
      const snap = window.FishOJProblemIde?.getSnapshot?.();
      return String(snap?.code ?? '');
    },
    getCustomTestInput: () => {
      const snap = window.FishOJProblemIde?.getSnapshot?.();
      const fromCase = snap?.cases?.[0]?.input;
      if (fromCase != null) return String(fromCase);
      return String(inputEl()?.value ?? '');
    },
    getLatestRuntime: () => {
      const snap = window.FishOJProblemIde?.getSnapshot?.();
      const run = snap?.lastRun;
      if (!run) return undefined;
      return {
        runKind: run.type === 'submit' ? 'submission' : 'pretest',
        status: run.status,
        stdout: run.stdout,
        stderr: run.stderr,
        timeUsed: run.time,
        memoryUsed: run.memory,
      };
    },
    isEligible: () => isAcmAssistantEligibleOnPage(),
    getBankContext: () => {
      const psid = resolveActiveProblemSetFromUrl();
      return psid ? { problemSetId: psid, bankType: 'default' } : { bankType: 'default' };
    },
  };

  setProblemIdeAssistantBridge(bridge);

  const refresh = () => {
    /* snapshot 实时读；仅派发语言事件给 UI */
  };
  document.addEventListener('problem-ide-code-change', refresh);
  document.addEventListener('problem-ide-run-result', refresh);
  document.addEventListener('problem-ide-submit-result', refresh);
  document.addEventListener('problem-ide-language-change', ((ev: Event) => {
    const lang = (ev as CustomEvent).detail?.language
      || (ev as CustomEvent).detail?.lang
      || bridge.getLanguage();
    dispatchIdeLanguageChange(String(lang || ''));
  }) as EventListener);

  return bridge;
}

export function readAcmProblemIdFromPage(): string | null {
  try {
    if (typeof UiContext !== 'undefined' && UiContext && typeof UiContext === 'object') {
      const hostPid = UiContext.problemIdeHost?.pid;
      const id = hostPid || UiContext.problemId || UiContext.problemNumId;
      if (id != null && String(id).trim()) return String(id).trim();
    }
  } catch {
    /* ignore */
  }
  try {
    const matched = /^\/ide\/([^/?#]+)/.exec(window.location.pathname);
    if (matched?.[1]?.trim()) return matched[1].trim();
  } catch {
    /* ignore */
  }
  return null;
}

export function readAcmStatementFromUiContext(): ReturnType<typeof parseAcmStatementContent> | null {
  try {
    const raw = extractZhContentFromProblemContent(UiContext?.pdoc?.content);
    if (!raw) return null;
    return parseAcmStatementContent(raw);
  } catch {
    return null;
  }
}

export function readAcmUiFlags() {
  let loginRequired = false;
  let antiCrawlBanned = false;
  let antiCrawlLimited = false;
  let contestNoAi = false;
  try {
    loginRequired = UiContext.problemIdeLoginRequired === true;
  } catch {
    /* ignore */
  }
  const cfg = window.__problemIdeConfig;
  if (cfg?.login_required === true) loginRequired = true;
  return { loginRequired, antiCrawlBanned, antiCrawlLimited, contestNoAi };
}

export function resolveActiveProblemSetFromUrl(): string | undefined {
  try {
    const psid = new URLSearchParams(window.location.search).get('psid');
    return psid?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function dispatchIdeLanguageChange(lang: string): void {
  window.dispatchEvent(new CustomEvent(CODENOTE_IDE_LANGUAGE_EVENT, { detail: { lang } }));
}

export function buildAcmClientSnapshot(problemId: string): ACMAssistantClientSnapshot {
  ensureFishOjProblemIdeBridge();
  const bridge = getProblemIdeAssistantBridge();
  const flags = readAcmUiFlags();
  const bank = bridge?.getBankContext?.();
  let domainId: string | undefined;
  let docId: number | undefined;
  let tid: number | string | undefined;
  try {
    domainId = UiContext.problemIdeHost?.domainId
      || (typeof UiContext.domainId === 'string' ? UiContext.domainId : undefined);
    docId = UiContext.problemIdeHost?.docId ?? UiContext.problemNumId ?? UiContext.pdoc?.docId;
    if (UiContext.tdoc?.docId != null && String(UiContext.tdoc.docId).trim() !== '') {
      tid = UiContext.tdoc.docId;
    }
  } catch {
    /* ignore */
  }
  if (tid == null) {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('tid');
      if (fromUrl?.trim()) tid = fromUrl.trim();
    } catch {
      /* ignore */
    }
  }

  return {
    domainId,
    docId: docId != null ? Number(docId) : undefined,
    ...(tid != null ? { tid } : {}),
    bankType: bank?.bankType,
    problemSetId: bank?.problemSetId || resolveActiveProblemSetFromUrl(),
    problemSetAbbr: bank?.problemSetAbbr,
    antiCrawlBanned: flags.antiCrawlBanned,
    antiCrawlLimited: flags.antiCrawlLimited,
    ide: bridge ? {
      language: bridge.getLanguage(),
      supportedLanguages: bridge.getSupportedLanguages(),
      code: String(bridge.getCode() ?? ''),
      customTestInput: String(bridge.getCustomTestInput() ?? ''),
    } : undefined,
    runtime: bridge?.getLatestRuntime?.(),
  };
}

export function isAcmAssistantEligibleOnPage(): boolean {
  try {
    if (UiContext.aiAssistant?.enabled === false) return false;
    if (UiContext.learning?.assistantEnabled === false) return false;
  } catch {
    /* ignore */
  }
  const flags = readAcmUiFlags();
  if (flags.contestNoAi) return false;
  if (flags.antiCrawlBanned) return false;
  const cfg = window.__problemIdeConfig;
  if (cfg && (cfg as { type?: string }).type === 'objective') return false;
  return true;
}
