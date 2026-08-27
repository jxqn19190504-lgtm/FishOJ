import type { AssistantPageContext } from '../../../shared/assistant-config.types';
import type { AIAssistantAdapter } from '../adapter.types';
import { CodeNoteContextProvider } from '../CodeNoteContextProvider';
import type { CodeNotePageContext } from './codenote-page-context';
import {
  detectNoteCodeLanguages,
  getGlobalPreferredCodeLanguage,
  normalizeCodeLanguage,
  resolvePreferredCodeLanguage,
  setGlobalPreferredCodeLanguage,
} from '../../core/AssistantCodeLanguage';
import { isAssistantDeepThinkEnabled } from '../../core/AssistantDeepThink';

import {
  CODENOTE_IDE_LANGUAGE_EVENT,
  LEGACY_HOT100_IDE_LANGUAGE_EVENT,
} from '../ide-language-events';

function mapPageContext(
  provider: CodeNoteContextProvider,
  selectableRoot: HTMLElement | null,
): AssistantPageContext {
  const page = provider.getPageContext();
  const available = detectNoteCodeLanguages(selectableRoot || undefined);
  const language = resolvePreferredCodeLanguage(available);
  return {
    scene: 'hot100-note',
    resourceId: page.pid,
    title: page.title,
    language,
    metadata: {
      abbreviation: page.abbreviation,
      psid: page.psid,
      mode: page.mode,
      isIntro: page.isIntro,
    },
  };
}

export function createHot100AssistantAdapter(
  initial: CodeNotePageContext,
): AIAssistantAdapter {
  const provider = new CodeNoteContextProvider(initial);

  const getRoot = () => document.getElementById('markdown-body');

  const adapter: AIAssistantAdapter = {
    getScene: () => 'hot100-note',

    getResourceId: () => provider.getPageContext().pid,

    getContext: () => mapPageContext(provider, getRoot()),

    getClientContext: () => ({
      ...provider.getClientContext(),
      scene: 'hot100-note',
    }),

    getMode: () => provider.getPageContext().mode,

    getCurrentLanguage: () => {
      const available = detectNoteCodeLanguages(getRoot());
      return resolvePreferredCodeLanguage(available);
    },

    getSupportedLanguages: () => detectNoteCodeLanguages(getRoot()),

    changeLanguage: (language: string) => {
      const normalized = normalizeCodeLanguage(language);
      if (!normalized) return;
      setGlobalPreferredCodeLanguage(normalized);
      syncCodeSwitcherTabs(normalized, getRoot());
      notifyIdeLanguageChange(normalized);
    },

    getSelectableRoot: getRoot,

    isSelectionAllowed: (range: Range) => {
      // 阅读受限时不允许划词进 AI（与页面遮罩权限一致）
      if (provider.getPageContext().isReadLimited) return false;
      const root = getRoot();
      if (!root) return false;
      return root.contains(range.startContainer) && root.contains(range.endContainer);
    },

    getAccessNotice: () => {
      const page = provider.getPageContext();
      if (page.isReadLimited) {
        return '解锁当前题库后可使用 AI 助教';
      }
      return undefined;
    },

    subscribeContextChange: (callback) => {
      const handler = (ev: Event) => {
        const detail = (ev as CustomEvent).detail as {
          pid?: string;
          title?: string;
          isIntro?: boolean;
          isReadLimited?: boolean;
        } | undefined;
        if (!detail?.pid) return;
        const modeRaw = localStorage.getItem('codenote_mode') || 'learning';
        const mode = modeRaw === 'practice' ? 'practice' : 'learning';
        provider.update({
          pid: detail.pid,
          title: detail.title || detail.pid,
          isIntro: !!detail.isIntro,
          mode,
          isReadLimited: detail.isReadLimited === true,
        });
        callback(mapPageContext(provider, getRoot()));
      };
      window.addEventListener('codenote:noteChanged', handler);
      return () => window.removeEventListener('codenote:noteChanged', handler);
    },
  };

  return Object.assign(adapter, {
    updatePageContext: (patch: Partial<CodeNotePageContext>) => provider.update(patch),
    getPageContext: () => provider.getPageContext(),
    getProvider: () => provider,
  });
}

export type Hot100AssistantAdapter = ReturnType<typeof createHot100AssistantAdapter>;

function syncCodeSwitcherTabs(lang: string, root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll('.code-switcher-tab[data-lang]').forEach((tab) => {
    const tabEl = tab as HTMLElement;
    if (normalizeCodeLanguage(tabEl.dataset.lang) !== lang) return;
    if (tabEl.classList.contains('active')) return;
    tabEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function notifyIdeLanguageChange(lang: string) {
  if (!document.querySelector('.inner-scratchpad')) return;
  window.setTimeout(() => {
    try {
      window.dispatchEvent(
        new CustomEvent(CODENOTE_IDE_LANGUAGE_EVENT, {
          detail: { lang },
          bubbles: false,
          cancelable: true,
        }),
      );
      window.dispatchEvent(
        new CustomEvent(LEGACY_HOT100_IDE_LANGUAGE_EVENT, {
          detail: { lang },
          bubbles: false,
          cancelable: true,
        }),
      );
    } catch {
      /* ignore */
    }
  }, 0);
}

export function refreshAdapterLanguageFromStorage() {
  return getGlobalPreferredCodeLanguage();
}
