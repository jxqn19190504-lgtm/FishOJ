/** AI 助教 — 题解编程语言偏好（全局，前后端共享） */

export const ASSISTANT_CODE_LANGUAGE_KEY = 'cf_assistant_code_language';

export const CODE_LANG_DISPLAY: Record<string, string> = {
  cpp: 'C++',
  c: 'C',
  python: 'Python',
  java: 'Java',
  javascript: 'JavaScript',
  js: 'JavaScript',
  go: 'Go',
  golang: 'Go',
};

export const CODE_LANG_ORDER = ['cpp', 'c', 'java', 'python', 'javascript', 'go'];

/** 同一 canonical 语言下，回写 IDE 时的优先 native key */
const NATIVE_LANG_PREFERENCE: Record<string, string[]> = {
  python: ['py.py3', 'py', 'python', 'py.pypy3', 'py.py2'],
  cpp: ['cc.cc17', 'cc.cc17o2', 'cc.cc14', 'cc.cc14o2', 'cc.cc11', 'cc.cc11o2', 'cc', 'cpp', 'c++'],
  c: ['c', 'c.c99', 'c.c11'],
  java: ['java'],
  go: ['go', 'golang'],
  javascript: ['js', 'javascript', 'nodejs', 'node'],
};

export type AssistantLanguageOptionLike = {
  label: string;
  value: string;
};

export function normalizeCodeLanguage(raw: unknown): string {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  if (s === 'js' || s === 'node' || s === 'nodejs' || s === 'javascript' || s.startsWith('js.')) {
    return 'javascript';
  }
  if (s === 'golang' || s === 'go' || s.startsWith('go.')) return 'go';
  // C 必须先于 C++（避免把 c.c99 误判；cc.* 走 C++）
  if (s === 'c' || s.startsWith('c.')) return 'c';
  if (
    s === 'cc' || s === 'cxx' || s === 'c++' || s === 'g++' || s === 'cpp'
    || s.startsWith('cpp') || s.startsWith('cc.') || s.startsWith('cxx')
  ) {
    return 'cpp';
  }
  if (s === 'python' || s.startsWith('py')) return 'python';
  if (s === 'java' || s.startsWith('java.')) return 'java';
  return s.includes('.') ? s.split('.')[0] : s;
}

export function getCodeLanguageDisplayName(lang: string): string {
  const key = normalizeCodeLanguage(lang);
  return CODE_LANG_DISPLAY[key] || key.toUpperCase();
}

/** Markdown fenced code block 语言标记 */
export function toMarkdownFenceLanguage(lang: string): string {
  const key = normalizeCodeLanguage(lang);
  if (key === 'javascript') return 'javascript';
  if (key === 'python') return 'python';
  if (key === 'java') return 'java';
  if (key === 'go') return 'go';
  if (key === 'c') return 'c';
  return 'cpp';
}

export function sortCodeLanguages(langs: string[]): string[] {
  const uniq = [...new Set(langs.map(normalizeCodeLanguage).filter(Boolean))];
  return uniq.sort((a, b) => {
    const ia = CODE_LANG_ORDER.indexOf(a);
    const ib = CODE_LANG_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/** 按归一化 value 去重，展示名用 canonical 文案（避免 Python/Python3/PyPy3 各占一行） */
export function dedupeAssistantLanguageOptions(
  options: Array<{ label?: string; value: string }>,
): AssistantLanguageOptionLike[] {
  const byValue = new Map<string, AssistantLanguageOptionLike>();
  for (const opt of options || []) {
    const value = normalizeCodeLanguage(opt.value);
    if (!value || byValue.has(value)) continue;
    byValue.set(value, {
      value,
      label: getCodeLanguageDisplayName(value),
    });
  }
  return sortCodeLanguages([...byValue.keys()]).map((value) => byValue.get(value)!);
}

/**
 * 将助教侧 canonical 语言映射回 IDE / Hydro 的 native lang key。
 * preferredNativeKey：若已在同一语言族，优先保持当前 IDE 选择（如 py.py3）。
 */
export function resolveNativeLanguageKey(
  requested: string,
  nativeKeys: string[],
  preferredNativeKey?: string,
): string {
  if (!Array.isArray(nativeKeys) || !nativeKeys.length) return '';
  const raw = String(requested || '').trim();
  if (raw && nativeKeys.includes(raw)) return raw;

  const canonical = normalizeCodeLanguage(requested);
  if (!canonical) return '';

  const matches = nativeKeys.filter((k) => normalizeCodeLanguage(k) === canonical);
  if (!matches.length) return '';

  const preferred = String(preferredNativeKey || '').trim();
  if (preferred && matches.includes(preferred)) return preferred;

  for (const key of NATIVE_LANG_PREFERENCE[canonical] || []) {
    if (matches.includes(key)) return key;
  }
  if (canonical === 'python') {
    const py3 = matches.find((k) => /py3|python3/i.test(k));
    if (py3) return py3;
  }
  return matches[0];
}
