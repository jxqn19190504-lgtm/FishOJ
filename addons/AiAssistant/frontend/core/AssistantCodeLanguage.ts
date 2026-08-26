import {
  ASSISTANT_CODE_LANGUAGE_KEY,
  dedupeAssistantLanguageOptions,
  getCodeLanguageDisplayName,
  normalizeCodeLanguage,
  resolveNativeLanguageKey,
  sortCodeLanguages,
} from '../../shared/assistant-code-language';

export function detectNoteCodeLanguages(root?: HTMLElement | null): string[] {
  const scope = root || document.getElementById('markdown-body') || document.body;
  const langs = new Set<string>();

  scope.querySelectorAll('.code-switcher-tab[data-lang]').forEach((tab) => {
    const lang = normalizeCodeLanguage((tab as HTMLElement).dataset.lang);
    if (lang) langs.add(lang);
  });

  if (langs.size === 0) {
    scope.querySelectorAll('pre code[class*="language-"]').forEach((code) => {
      const cls = Array.from(code.classList).find((c) => c.startsWith('language-'));
      if (cls) {
        const lang = normalizeCodeLanguage(cls.replace('language-', ''));
        if (lang) langs.add(lang);
      }
    });
  }

  return sortCodeLanguages([...langs]);
}

export function getGlobalPreferredCodeLanguage(): string | null {
  try {
    const raw = localStorage.getItem(ASSISTANT_CODE_LANGUAGE_KEY);
    return raw ? normalizeCodeLanguage(raw) : null;
  } catch {
    return null;
  }
}

export function setGlobalPreferredCodeLanguage(lang: string): void {
  try {
    localStorage.setItem(ASSISTANT_CODE_LANGUAGE_KEY, normalizeCodeLanguage(lang));
  } catch {
    /* ignore */
  }
}

export function resolvePreferredCodeLanguage(available: string[]): string {
  if (!available.length) return 'cpp';
  const preferred = getGlobalPreferredCodeLanguage();
  if (preferred && available.includes(preferred)) return preferred;
  return available[0];
}

export function syncPageCodeLanguage(lang: string): void {
  const normalized = normalizeCodeLanguage(lang);
  document.querySelectorAll('.code-switcher-tab[data-lang]').forEach((tab) => {
    const tabEl = tab as HTMLElement;
    if (normalizeCodeLanguage(tabEl.dataset.lang) !== normalized) return;
    if (tabEl.classList.contains('active')) return;
    tabEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** 通知笔记内嵌 IDE 切换语言（与 CodeSwitcher 事件一致） */
export function notifyNoteIdeLanguageChange(lang: string): void {
  const normalized = normalizeCodeLanguage(lang);
  if (!normalized) return;
  if (!document.querySelector('.inner-scratchpad')) return;
  window.setTimeout(() => {
    try {
      window.dispatchEvent(
        new CustomEvent('hot100:codeLanguageChanged', {
          detail: { lang: normalized },
          bubbles: false,
          cancelable: true,
        }),
      );
    } catch {
      /* ignore */
    }
  }, 0);
}

export {
  dedupeAssistantLanguageOptions,
  getCodeLanguageDisplayName,
  normalizeCodeLanguage,
  resolveNativeLanguageKey,
};
