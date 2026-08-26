/** FishOJ：无 CodeNote CodeSwitcher，保留 Prism 高亮即可 */
function initCodeSwitchers(_root?: ParentNode | null): void {
  /* no-op */
}

/**
 * 与 Hot100 MarkdownEnhancer 一致的代码 IDE 增强：
 * 1) 规范化 language-* 别名
 * 2) 全部代码块包成 .code-switcher（Hot100 语言 Tab + 复制 + 暗色 IDE）
 * 3) line-numbers → Prism 高亮 → initCodeSwitchers
 */

const PRISM_VERSION = '1.29.0';
const PRISM_CDN = `https://cdnjs.cloudflare.com/ajax/libs/prism/${PRISM_VERSION}`;
const PRISM_CORE_URL = `${PRISM_CDN}/prism.min.js`;
const PRISM_LINE_NUMBERS_URL = `${PRISM_CDN}/plugins/line-numbers/prism-line-numbers.min.js`;
const PRISM_LANG_URLS: readonly string[] = [
  `${PRISM_CDN}/components/prism-python.min.js`,
  `${PRISM_CDN}/components/prism-javascript.min.js`,
  `${PRISM_CDN}/components/prism-typescript.min.js`,
  `${PRISM_CDN}/components/prism-java.min.js`,
  `${PRISM_CDN}/components/prism-cpp.min.js`,
  `${PRISM_CDN}/components/prism-c.min.js`,
  `${PRISM_CDN}/components/prism-go.min.js`,
  `${PRISM_CDN}/components/prism-rust.min.js`,
  `${PRISM_CDN}/components/prism-bash.min.js`,
];

/** 与 Hot100 CodeSwitcher LANG_DISPLAY_MAP / 常见别名对齐 */
const LANGUAGE_ALIASES: Record<string, string> = {
  'c++': 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  'c++11': 'cpp',
  'c++14': 'cpp',
  'c++17': 'cpp',
  'c++20': 'cpp',
  py: 'python',
  python3: 'python',
  py3: 'python',
  js: 'javascript',
  node: 'javascript',
  ts: 'typescript',
  golang: 'go',
  rs: 'rust',
  'c#': 'csharp',
  cs: 'csharp',
};

let prismLoadingPromise: Promise<void> | null = null;

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.addEventListener('load', () => {
      s.dataset.loaded = '1';
      resolve();
    }, { once: true });
    s.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(s);
  });
}

async function ensurePrismLoaded(): Promise<void> {
  const w = window as Window & { Prism?: { languages?: { cpp?: unknown } } };
  if (w.Prism?.languages?.cpp) return;
  if (prismLoadingPromise) return prismLoadingPromise;
  prismLoadingPromise = (async () => {
    await loadScriptOnce(PRISM_CORE_URL);
    await Promise.all([
      loadScriptOnce(PRISM_LINE_NUMBERS_URL),
      ...PRISM_LANG_URLS.map((u) => loadScriptOnce(u)),
    ]);
  })().catch((err) => {
    prismLoadingPromise = null;
    throw err;
  });
  return prismLoadingPromise;
}

function normalizeLanguageClass(code: HTMLElement): void {
  const infoClass = Array.from(code.classList).find((c) => c.startsWith('language-'));
  if (!infoClass) return;
  const raw = infoClass.replace(/^language-/, '').toLowerCase();
  const normalized = LANGUAGE_ALIASES[raw] || raw;
  if (normalized !== raw) {
    code.classList.remove(infoClass);
    code.classList.add(`language-${normalized}`);
  }
}

/**
 * Hot100 笔记里正式代码几乎都在 .code-switcher 内。
 * 助教流式 HTML 只有 <pre><code>，这里先包成同样外壳，再交给 initCodeSwitchers。
 */
function wrapPresAsCodeSwitcher(root: HTMLElement): void {
  root.querySelectorAll('pre').forEach((pre) => {
    if (pre.closest('.code-switcher') || pre.closest('.simple-code-block')) return;
    const code = pre.querySelector('code');
    if (!code) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'code-switcher';
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);
  });
}

function removeLegacyCopyControls(root: HTMLElement): void {
  root.querySelectorAll('.code-toolbar .toolbar-item').forEach((el) => el.remove());
  root.querySelectorAll('.code-toolbar .toolbar').forEach((el) => {
    if (!el.children.length) el.remove();
  });
  root.querySelectorAll('.cf-assistant-code-copy').forEach((el) => el.remove());
}

/** 对齐 MarkdownEnhancer.enhanceSubtree 的代码部分 */
function enhanceCodeBlocksLikeHot100(root: HTMLElement): void {
  root.querySelectorAll('pre code').forEach((block) => {
    normalizeLanguageClass(block as HTMLElement);
    block.parentElement?.classList.add('line-numbers');
  });

  wrapPresAsCodeSwitcher(root);

  const Prism = (window as Window & {
    Prism?: { highlightElement?: (el: Element) => void };
  }).Prism;

  if (Prism?.highlightElement) {
    root.querySelectorAll('pre code').forEach((block) => {
      try {
        // 允许对同一节点重复高亮（历史重载）
        delete (block as HTMLElement).dataset.prismEnhanced;
        Prism.highlightElement!(block);
      } catch (e) {
        console.warn('[AIAssistant] Prism.highlightElement 失败', e);
      }
    });
  }

  removeLegacyCopyControls(root);
  initCodeSwitchers(root);
}

/** 流式 done 或历史加载后：Hot100 同款代码 IDE（仅 assistant 消息体） */
export function enhanceAssistantMessageBody(root: HTMLElement) {
  if (!root) return;
  if (root.dataset.cfAssistantCodeEnhancing === '1') return;

  root.dataset.cfAssistantCodeEnhancing = '1';
  void (async () => {
    try {
      await ensurePrismLoaded();
    } catch (e) {
      console.warn('[AIAssistant] Prism 加载失败，仅应用 code-switcher 结构', e);
    }
    try {
      // renderMessages 可能在 await 期间重建 DOM，避免写到已脱离文档的节点
      if (!root.isConnected) return;
      enhanceCodeBlocksLikeHot100(root);
    } finally {
      delete root.dataset.cfAssistantCodeEnhancing;
      if (root.isConnected) {
        root.dataset.cfAssistantCodeEnhanced = '1';
      }
    }
  })();
}

export function enhanceAssistantMessages(root: HTMLElement, role: 'assistant' = 'assistant') {
  root.querySelectorAll(`.cf-assistant-msg--${role} .cf-assistant-msg-body`).forEach((el) => {
    const body = el as HTMLElement;
    delete body.dataset.cfAssistantCodeEnhanced;
    enhanceAssistantMessageBody(body);
  });
}
