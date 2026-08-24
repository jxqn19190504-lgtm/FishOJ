import './problem_ide.css';
import { $, addPage, NamedPage, Notification, request } from '@hydrooj/ui-default';
import {
    escapeHtml,
    getCasePreviewFid,
    injectStatementHeading,
    initAlgTagToggle,
    initExpMode,
    initStatementToc,
    initTimer,
    setupIdePsetDrawer,
    setupIdeSectionSwitcher,
} from './problem_ide_extras';

declare const UiContext: {
    postSubmitUrl?: string;
    pretestConnUrl?: string;
    codeLang?: string;
    codeTemplate?: Record<string, string> | string;
    tdoc?: { docId: string };
    problemIdeLoginRequired?: boolean;
    problemIdeCanSubmit?: boolean;
    ws_prefix?: string;
    getRecordDetailUrl?: string;
    getSubmissionsUrl?: string;
    problemId?: string;
    problemNumId?: number;
    pdoc?: { docId: number; pid?: string; title?: string; config?: Record<string, unknown> };
};

declare global {
    interface Window {
        __problemIdeLangRange?: Record<string, string>;
        __problemIdeConfig?: { login_required?: boolean; can_submit?: boolean };
        showSignInDialog?: () => void;
    }
}

const FS_KEY = 'problem_ide_fontsize_v1';
const THEME_KEY = 'problem_ide_dark_v1';
const SPLIT_KEY = 'problem_ide_split_v1';
const EDITOR_HIDDEN_BY_SPLIT_KEY = 'problem_ide_editor_hidden_v1';
const DRAWER_KEY = 'problem_ide_drawer_h_v1';
const GUTTER_WIDTH = 5;
const MIN_LEFT_RATIO = 0.1;
const MIN_RIGHT_RATIO = 0.1;
const MAX_LEFT_RATIO = 0.9;
const HIDE_RIGHT_VISIBLE_WIDTH = 50;
const SUBMIT_HTTP_TIMEOUT_MS = 20000;
const HISTORY_PAGE_SIZE = 20;
const MAX_CASES = 5;

const SN: Record<number, string> = {
    0: 'WAITING', 1: 'ACCEPTED', 2: 'WRONG_ANSWER',
    3: 'TIME_LIMIT_EXCEEDED', 4: 'MEMORY_LIMIT_EXCEEDED', 5: 'OUTPUT_LIMIT_EXCEEDED',
    6: 'RUNTIME_ERROR', 7: 'COMPILE_ERROR', 8: 'SYSTEM_ERROR', 9: 'CANCELED',
    10: 'ETC', 11: 'HACKED', 20: 'JUDGING', 21: 'COMPILING', 22: 'FETCHED',
};
const DONE = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
const PROGRESS = new Set([0, 20, 21, 22]);
const LABEL: Record<string, string> = {
    ACCEPTED: '通过', WRONG_ANSWER: '答案错误',
    TIME_LIMIT_EXCEEDED: '时间超限', MEMORY_LIMIT_EXCEEDED: '内存超限',
    OUTPUT_LIMIT_EXCEEDED: '输出超限', RUNTIME_ERROR: '运行错误',
    COMPILE_ERROR: '编译错误', SYSTEM_ERROR: '系统错误',
    CANCELED: '已取消', JUDGING: '评测中…', COMPILING: '编译中…',
    WAITING: '等待中…', FETCHED: '数据获取中…', ETC: '未知错误', HACKED: '被 Hack',
};

const MONACO_VS_SOURCES = [
    '/monaco/vs',
    'https://cdn.jsdelivr.net/npm/monaco-editor@0.54.0/min/vs',
    'https://unpkg.com/monaco-editor@0.54.0/min/vs',
    'https://cdn.bootcdn.net/ajax/libs/monaco-editor/0.53.0/min/vs',
];

function getWsPrefix(): string {
    if (UiContext.ws_prefix) return UiContext.ws_prefix;
    const p = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${p}//${window.location.host}/`;
}

async function promiseWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let to: ReturnType<typeof setTimeout> | undefined;
    const timeoutP = new Promise<never>((_, rej) => {
        to = setTimeout(() => rej(new Error(`${label}超时（${Math.round(ms / 1000)}s）`)), ms);
    });
    try {
        return await Promise.race([p, timeoutP]);
    } finally {
        if (to) clearTimeout(to);
    }
}

function loadMonacoFromBase(base: string): Promise<typeof import('monaco-editor')> {
    return new Promise((resolve, reject) => {
        const w = window as unknown as { monaco?: typeof import('monaco-editor'); require?: any };
        const script = document.createElement('script');
        let settled = false;
        const finish = (err?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            script.remove();
            if (err) reject(err);
        };
        const timeoutId = window.setTimeout(() => finish(new Error(`加载超时: ${base}`)), 15000);
        script.onload = () => {
            if (!w.require) { finish(new Error('window.require 未定义')); return; }
            w.require.config({ paths: { vs: base } });
            w.require(['vs/editor/editor.main'], () => {
                if (settled) return;
                if (w.monaco) {
                    settled = true;
                    clearTimeout(timeoutId);
                    resolve(w.monaco);
                } else finish(new Error('Monaco not defined'));
            }, (err: unknown) => finish(new Error(String(err))));
        };
        script.onerror = () => finish(new Error(`Script 加载失败: ${base}`));
        script.src = `${base}/loader.js`;
        document.head.appendChild(script);
    });
}

async function loadMonacoEditor() {
    const w = window as unknown as { monaco?: typeof import('monaco-editor') };
    if (w.monaco) return w.monaco;
    let lastErr: Error | null = null;
    for (const base of MONACO_VS_SOURCES) {
        try { return await loadMonacoFromBase(base); } catch (e) {
            lastErr = e instanceof Error ? e : new Error(String(e));
        }
    }
    throw lastErr || new Error('Monaco 加载失败');
}

function showProblemTab($root: ReturnType<typeof $>, type: string) {
    $root.find('.section__tab-header-item').removeClass('tab--active');
    $root.find(`.section__tab-header-item[data-type="${type}"]`).addClass('tab--active');
    $root.find('.problem_content').hide();
    const el = document.getElementById(`content-${type}`);
    if (el) $(el).show();
    try {
        window.dispatchEvent(new CustomEvent('problem-ide:tab-changed', { detail: { type } }));
    } catch { /* ignore */ }
}

function initProblemTabs($root: ReturnType<typeof $>) {
    $(document).on('click', '.problem-ide-left .section__tab-header-item', (ev) => {
        ev.preventDefault();
        const type = $(ev.currentTarget).attr('data-type');
        if (type) showProblemTab($root, type);
    });
    let $active = $root.find('.section__tab-header-item.tab--active').first();
    if (!$active.length) $active = $root.find('.section__tab-header-item').first();
    const t = $active.attr('data-type');
    if (t) showProblemTab($root, t);
}

function getMinLeftWidth(totalW: number) { return Math.max(0, Math.round(totalW * MIN_LEFT_RATIO)); }
function getMinRightWidth(totalW: number) { return Math.max(0, Math.round(totalW * MIN_RIGHT_RATIO)); }
function getHideAtLeftWidth(totalW: number) { return totalW - GUTTER_WIDTH - HIDE_RIGHT_VISIBLE_WIDTH; }

function applyIdeSplit(
    left: HTMLElement, gutter: HTMLElement, right: HTMLElement | null,
    root: HTMLElement, targetWidth: number, layoutCb: () => void,
) {
    const totalW = root.getBoundingClientRect().width;
    const minLeftW = getMinLeftWidth(totalW);
    const minRightW = getMinRightWidth(totalW);
    const hideAtLeftW = getHideAtLeftWidth(totalW);
    if (targetWidth >= hideAtLeftW) {
        localStorage.setItem(EDITOR_HIDDEN_BY_SPLIT_KEY, '1');
        left.style.flex = '1 1 auto';
        if (right) { right.style.flex = '0 0 0'; right.style.width = '0'; }
        root.classList.add('problem-ide-root--editor-hidden');
        layoutCb();
        return;
    }
    localStorage.removeItem(EDITOR_HIDDEN_BY_SPLIT_KEY);
    root.classList.remove('problem-ide-root--editor-hidden');
    if (right) { right.style.flex = ''; right.style.width = ''; }
    const maxW = Math.min(totalW * MAX_LEFT_RATIO, Math.max(minLeftW, hideAtLeftW));
    const maxLeftForRight = Math.max(minLeftW, totalW - GUTTER_WIDTH - minRightW);
    const width = Math.min(maxW, maxLeftForRight, Math.max(minLeftW, targetWidth));
    left.style.flex = `0 0 ${(width / totalW) * 100}%`;
    localStorage.setItem(SPLIT_KEY, String((width / totalW) * 100));
    layoutCb();
}

function restoreIdeSplit(
    left: HTMLElement, gutter: HTMLElement, right: HTMLElement | null,
    root: HTMLElement, layoutCb: () => void,
) {
    const totalW = root.getBoundingClientRect().width;
    if (localStorage.getItem(EDITOR_HIDDEN_BY_SPLIT_KEY) === '1') {
        applyIdeSplit(left, gutter, right, root, getHideAtLeftWidth(totalW), layoutCb);
        return;
    }
    let targetW = totalW * 0.5;
    const saved = localStorage.getItem(SPLIT_KEY);
    if (saved) {
        const p = parseFloat(saved);
        if (p >= 20 && p <= 70) targetW = (totalW * p) / 100;
    }
    applyIdeSplit(left, gutter, right, root, targetW, layoutCb);
}

function initGutter(
    gutter: HTMLElement, left: HTMLElement, right: HTMLElement | null,
    root: HTMLElement, layoutCb: () => void,
) {
    let startX = 0;
    let startTargetW = 0;
    const onMove = (e: MouseEvent) => {
        applyIdeSplit(left, gutter, right, root, startTargetW + (e.clientX - startX), layoutCb);
    };
    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        gutter.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    };
    gutter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startTargetW = left.getBoundingClientRect().width;
        gutter.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

function extractFencePairsFromProblemRoot(root: HTMLElement): { input: string; expected: string }[] {
    const blocks = [...root.querySelectorAll('pre')].map((pre) => {
        const t = (pre.textContent || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
        return t;
    }).filter((t) => t.length);
    const pairs: { input: string; expected: string }[] = [];
    for (let i = 0; i + 1 < blocks.length; i += 2) {
        pairs.push({ input: blocks[i], expected: blocks[i + 1] });
    }
    return pairs;
}

function resolveUserCodeTemplateString(lang: string, tpl: Record<string, string> | string): string | null {
    if (typeof tpl === 'string') return tpl;
    if (tpl[lang]) return tpl[lang];
    const prefix = lang.split('.')[0];
    for (const [k, v] of Object.entries(tpl)) {
        if (k === prefix || k.startsWith(`${prefix}.`)) return v;
    }
    return null;
}

addPage(new NamedPage(['problem_ide'], async () => {
    const loaderEl = document.getElementById('problemIdePageLoader');
    const rootEl = document.getElementById('problemIdeRoot');
    const revealStatement = () => {
        rootEl?.classList.remove('problem-ide-root--boot');
        rootEl?.classList.add('problem-ide-root--ready', 'problem-ide-root--ide-pending');
        loaderEl?.classList.add('problem-ide-page-loader--hidden');
        window.setTimeout(() => loaderEl?.remove(), 400);
    };
    const revealIde = () => {
        rootEl?.classList.remove('problem-ide-root--ide-pending');
        document.getElementById('problemIdeRightPending')?.remove();
    };

    const langEl = document.getElementById('problemIdeLang') as HTMLSelectElement | null;
    const monacoEl = document.getElementById('problemIdeMonaco');
    const runBtn = document.getElementById('problemIdeRunBtn') as HTMLButtonElement | null;
    const submitBtn = document.getElementById('problemIdeSubmitBtn') as HTMLButtonElement | null;
    const inputEl = document.getElementById('problemIdeInput') as HTMLTextAreaElement | null;
    const expectedEl = document.getElementById('problemIdeExpected') as HTMLTextAreaElement | null;
    const outputEl = document.getElementById('problemIdeOutput');
    const statusEl = document.getElementById('problemIdeStatus');
    const passRateEl = document.getElementById('problemIdePassRate');
    const historyEl = document.getElementById('problemIdeHistory');
    const leftPanel = document.getElementById('problemIdeLeft');
    const gutterEl = document.getElementById('problemIdeGutter');
    const rightPanel = document.getElementById('problemIdeRight');
    const drawer = document.getElementById('problemIdeDrawer');
    const drawerToggle = document.getElementById('problemIdeDrawerToggle');
    const drawerResize = document.getElementById('problemIdeDrawerResize');
    const fontInput = document.getElementById('problemIdeFontSize') as HTMLInputElement | null;
    const themeSelect = document.getElementById('problemIdeThemeSelect') as HTMLSelectElement | null;
    const settingsBtn = document.getElementById('problemIdeSettingsBtn');
    const settingsPanel = document.getElementById('problemIdeSettingsPanel');
    const resetBtn = document.getElementById('problemIdeResetCodeBtn') as HTMLButtonElement | null;

    if (!langEl || !monacoEl || !runBtn || !submitBtn || !inputEl || !outputEl || !rootEl) {
        revealStatement();
        return;
    }

    const langRange = window.__problemIdeLangRange;
    if (!langRange || !Object.keys(langRange).length) {
        revealStatement();
        return;
    }

    injectStatementHeading();
    initAlgTagToggle();
    initProblemTabs($('.problem-ide-left'));
    initStatementToc();
    setupIdePsetDrawer();
    setupIdeSectionSwitcher();
    initTimer();
    initExpMode(rootEl);
    revealStatement();
    const monacoPromise = loadMonacoEditor();

    const langKeys = Object.keys(langRange);
    langEl.innerHTML = '';
    for (const k of langKeys) {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = langRange[k] || k;
        langEl.appendChild(opt);
    }

    const pid = String(UiContext.problemId || UiContext.problemNumId || '');
    const codeKey = (lang: string) => `problem_ide_code_${pid}_${lang}`;
    const langKey = `problem_ide_lang_${pid}`;
    const casesKey = `problem_ide_cases_${pid}`;
    const ideCanSubmit = UiContext.problemIdeCanSubmit === true
        || window.__problemIdeConfig?.can_submit === true;
    const ideLoginRequired = UiContext.problemIdeLoginRequired === true;

    const savedLang = localStorage.getItem(langKey);
    const preferredLangs = ['cc.cc14', 'cc', 'cc.cc14o2', 'py.py3', 'c'];
    const fromUser = UiContext.codeLang && langKeys.includes(UiContext.codeLang)
        && !/^bash/i.test(UiContext.codeLang)
        ? UiContext.codeLang
        : '';
    const defaultLang = (savedLang && langKeys.includes(savedLang))
        ? savedLang
        : (fromUser || preferredLangs.find((k) => langKeys.includes(k)) || langKeys[0]);
    langEl.value = defaultLang;

    type TestCase = { input: string; expected: string };
    let cases: TestCase[] = [];
    try {
        const raw = localStorage.getItem(casesKey);
        if (raw) cases = JSON.parse(raw);
    } catch { /* ignore */ }
    if (!cases.length) cases = [{ input: '', expected: '' }];

    const saveCases = () => {
        const idx = Number(inputEl.dataset.caseIndex || '0') || 0;
        if (cases[idx]) {
            cases[idx].input = inputEl.value;
            cases[idx].expected = expectedEl?.value || '';
        }
        localStorage.setItem(casesKey, JSON.stringify(cases));
    };
    const renderCaseTabs = () => {
        const tabs = document.getElementById('problemIdeCaseTabs');
        if (!tabs) return;
        const cur = Number(inputEl.dataset.caseIndex || '0') || 0;
        tabs.innerHTML = cases.map((_, i) => (
            `<button type="button" class="problem-ide-case-tab${i === cur ? ' problem-ide-case-tab--active' : ''}" data-i="${i}">用例 ${i + 1}</button>`
        )).join('');
        tabs.querySelectorAll('.problem-ide-case-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                saveCases();
                const i = Number((btn as HTMLElement).dataset.i);
                inputEl.dataset.caseIndex = String(i);
                inputEl.value = cases[i]?.input || '';
                if (expectedEl) expectedEl.value = cases[i]?.expected || '';
                renderCaseTabs();
            });
        });
    };
    inputEl.dataset.caseIndex = '0';
    inputEl.value = cases[0].input;
    if (expectedEl) expectedEl.value = cases[0].expected;
    renderCaseTabs();
    document.getElementById('problemIdeCaseAdd')?.addEventListener('click', () => {
        if (cases.length >= MAX_CASES) return;
        saveCases();
        cases.push({ input: '', expected: '' });
        inputEl.dataset.caseIndex = String(cases.length - 1);
        inputEl.value = '';
        if (expectedEl) expectedEl.value = '';
        renderCaseTabs();
        saveCases();
    });
    document.getElementById('problemIdeCaseFillSamples')?.addEventListener('click', () => {
        const root = document.getElementById('content-ZhContent') || document.getElementById('problemIdeProblemContent');
        const pairs = root ? extractFencePairsFromProblemRoot(root) : [];
        if (!pairs.length) {
            Notification.info('题面中未识别到样例');
            return;
        }
        cases = pairs.slice(0, MAX_CASES);
        inputEl.dataset.caseIndex = '0';
        inputEl.value = cases[0].input;
        if (expectedEl) expectedEl.value = cases[0].expected;
        renderCaseTabs();
        saveCases();
        Notification.success(`已填入 ${cases.length} 组样例`);
    });

    let monaco: typeof import('monaco-editor');
    try {
        monaco = await monacoPromise;
    } catch (e) {
        const pending = document.getElementById('problemIdeRightPending');
        if (pending) {
            const text = pending.querySelector('.problem-ide-right__pending-text');
            if (text) text.textContent = '编辑器加载失败，请刷新页面重试';
        }
        return;
    }

    const mapLang = (lang: string) => {
        const l = lang.toLowerCase();
        if (l.includes('python') || l.startsWith('py')) return 'python';
        if (l.startsWith('java') && !l.includes('script')) return 'java';
        if (l.includes('node') || l.includes('javascript') || l.startsWith('js')) return 'javascript';
        if (l.startsWith('go')) return 'go';
        if (l.includes('rust')) return 'rust';
        return 'cpp';
    };

    const templateFor = (lang: string) => {
        if (!UiContext.codeTemplate) return '';
        return resolveUserCodeTemplateString(lang, UiContext.codeTemplate) || '';
    };
    const savedCode = localStorage.getItem(codeKey(defaultLang));
    const initialCode = savedCode ?? templateFor(defaultLang);

    const fontSize = Math.min(28, Math.max(10, parseInt(localStorage.getItem(FS_KEY) || '14', 10) || 14));
    if (fontInput) fontInput.value = String(fontSize);
    const isSiteDark = document.documentElement.classList.contains('theme--dark');
    let currentTheme = localStorage.getItem(THEME_KEY) === '1' ? 'vs-dark' : (localStorage.getItem(THEME_KEY) === '0' ? 'vs' : (isSiteDark ? 'vs-dark' : 'vs'));
    if (themeSelect) {
        themeSelect.innerHTML = '<option value="vs">Light</option><option value="vs-dark">Dark</option>';
        themeSelect.value = currentTheme;
    }

    const editor = monaco.editor.create(monacoEl, {
        model: monaco.editor.createModel(initialCode, mapLang(defaultLang)),
        theme: currentTheme,
        fontSize,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        padding: { top: 8 },
        lineNumbersMinChars: 3,
        renderLineHighlight: 'line',
    });
    revealIde();
    const cfg = (UiContext.pdoc?.config || window.__problemIdeConfig || {}) as Record<string, unknown>;
    const modeTagEl = document.getElementById('problemIdeModeTag');
    const spjTagEl = document.getElementById('problemIdeSpjTag');
    if (modeTagEl) {
        const isCore = cfg.type === 'default' && (cfg as { subType?: string }).subType === 'core';
        modeTagEl.style.display = '';
        if (isCore) {
            modeTagEl.textContent = '核心代码模式';
            modeTagEl.className = 'problem-ide-mode-tag problem-ide-mode-tag--core';
        } else {
            modeTagEl.textContent = 'ACM 模式';
            modeTagEl.className = 'problem-ide-mode-tag problem-ide-mode-tag--acm';
        }
    }
    if (spjTagEl) {
        const checkerType = typeof cfg.checker_type === 'string' ? cfg.checker_type : '';
        if (checkerType === 'testlib') {
            spjTagEl.style.display = '';
            spjTagEl.textContent = 'Special Judge';
            spjTagEl.className = 'problem-ide-mode-tag problem-ide-mode-tag--spj';
        }
    }
    editor.onDidChangeModelContent(() => {
        localStorage.setItem(codeKey(langEl.value), editor.getValue());
    });
    langEl.addEventListener('change', () => {
        localStorage.setItem(langKey, langEl.value);
        const next = localStorage.getItem(codeKey(langEl.value)) ?? templateFor(langEl.value);
        editor.setModel(monaco.editor.createModel(next, mapLang(langEl.value)));
    });
    resetBtn?.addEventListener('click', () => {
        if (!window.confirm('确定重置为初始代码模板？')) return;
        const filled = templateFor(langEl.value);
        editor.setModel(monaco.editor.createModel(filled, mapLang(langEl.value)));
        localStorage.setItem(codeKey(langEl.value), filled);
    });
    fontInput?.addEventListener('change', () => {
        const n = Math.min(28, Math.max(10, parseInt(fontInput.value, 10) || 14));
        editor.updateOptions({ fontSize: n });
        localStorage.setItem(FS_KEY, String(n));
    });
    settingsBtn?.addEventListener('click', () => {
        settingsPanel?.classList.toggle('problem-ide-settings--hidden');
    });
    themeSelect?.addEventListener('change', () => {
        currentTheme = themeSelect.value;
        monaco.editor.setTheme(currentTheme);
        localStorage.setItem(THEME_KEY, currentTheme === 'vs-dark' ? '1' : '0');
    });

    const layoutEditor = () => { editor.layout(); };
    if (leftPanel && gutterEl && rightPanel) {
        restoreIdeSplit(leftPanel, gutterEl, rightPanel, rootEl, layoutEditor);
        initGutter(gutterEl, leftPanel, rightPanel, rootEl, layoutEditor);
    }
    const expandBtn = document.getElementById('problemIdeStatementExpandBtn');
    const collapseBtn = document.getElementById('problemIdeStatementCollapseBtn');
    expandBtn?.addEventListener('click', () => {
        const on = rootEl.classList.toggle('problem-ide-root--statement-expanded');
        rootEl.classList.remove('problem-ide-root--statement-collapsed');
        if (on && leftPanel) leftPanel.style.flex = '1 1 100%';
        else if (leftPanel && gutterEl && rightPanel) restoreIdeSplit(leftPanel, gutterEl, rightPanel, rootEl, layoutEditor);
        layoutEditor();
        try { window.dispatchEvent(new CustomEvent('problem-ide:layout-changed')); } catch { /* ignore */ }
    });
    collapseBtn?.addEventListener('click', () => {
        const on = rootEl.classList.toggle('problem-ide-root--statement-collapsed');
        rootEl.classList.remove('problem-ide-root--statement-expanded');
        if (on && leftPanel) leftPanel.style.flex = '0 0 5%';
        else if (leftPanel && gutterEl && rightPanel) restoreIdeSplit(leftPanel, gutterEl, rightPanel, rootEl, layoutEditor);
        layoutEditor();
        try { window.dispatchEvent(new CustomEvent('problem-ide:layout-changed')); } catch { /* ignore */ }
    });

    const savedH = localStorage.getItem(DRAWER_KEY);
    if (drawer && savedH) {
        const h = parseInt(savedH, 10);
        if (h >= 80 && h <= 600) drawer.style.height = `${h}px`;
    }
    drawerToggle?.addEventListener('click', () => {
        drawer?.classList.toggle('problem-ide-drawer--collapsed');
        layoutEditor();
    });
    if (drawer && drawerResize) {
        let rStartY = 0;
        let rStartH = 0;
        const onResizeMove = (e: MouseEvent) => {
            const dy = rStartY - e.clientY;
            const maxH = window.innerHeight * 0.6;
            const newH = Math.max(80, Math.min(maxH, rStartH + dy));
            drawer.style.height = `${newH}px`;
            localStorage.setItem(DRAWER_KEY, String(newH));
            layoutEditor();
        };
        const onResizeUp = () => {
            document.removeEventListener('mousemove', onResizeMove);
            document.removeEventListener('mouseup', onResizeUp);
            drawerResize.classList.remove('dragging');
            drawer.classList.remove('problem-ide-drawer--resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        drawerResize.addEventListener('mousedown', (e: MouseEvent) => {
            if (drawer.classList.contains('problem-ide-drawer--collapsed')) return;
            e.preventDefault();
            rStartY = e.clientY;
            rStartH = drawer.getBoundingClientRect().height;
            drawerResize.classList.add('dragging');
            drawer.classList.add('problem-ide-drawer--resizing');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeUp);
        });
    }

    const switchTab = (name: string) => {
        document.querySelectorAll('.problem-ide-tab').forEach((t) => {
            t.classList.toggle('problem-ide-tab--active', (t as HTMLElement).dataset.tab === name);
        });
        document.querySelectorAll('.problem-ide-panel').forEach((p) => {
            (p as HTMLElement).hidden = (p as HTMLElement).dataset.panel !== name;
        });
    };
    document.querySelectorAll('.problem-ide-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            const n = (tab as HTMLElement).dataset.tab;
            if (n) {
                switchTab(n);
                if (n === 'history') void loadHistory();
            }
        });
    });
    const expandDrawer = () => drawer?.classList.remove('problem-ide-drawer--collapsed');

    const setStatus = (text: string, type: 'ok' | 'err' | 'pending') => {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = `problem-ide-status problem-ide-status--${type}`;
        statusEl.hidden = !text;
    };
    const setPassRate = (text: string, type?: 'ok' | 'err') => {
        if (!passRateEl) return;
        passRateEl.textContent = text;
        passRateEl.hidden = !text;
        passRateEl.className = `problem-ide-pass-rate${type ? ` problem-ide-pass-rate--${type}` : ''}`;
    };

    let runBusy = false;
    let submitBusy = false;
    const syncBtns = () => {
        if (!ideCanSubmit) {
            runBtn.disabled = true;
            submitBtn.disabled = true;
            runBtn.textContent = '▶ 登录后自测';
            submitBtn.textContent = '登录后提交';
            return;
        }
        runBtn.disabled = runBusy || submitBusy;
        submitBtn.disabled = submitBusy || runBusy;
        if (!runBusy) runBtn.textContent = '▶ 自测运行';
        if (!submitBusy) submitBtn.textContent = '提交';
    };
    syncBtns();

    const finishBusy = (kind: 'run' | 'submit') => {
        if (kind === 'run') runBusy = false;
        else submitBusy = false;
        syncBtns();
    };

    const normalizeRid = (v: unknown) => String(v ?? '').trim();
    const getRecordStatus = (rdoc: any) => (typeof rdoc?.status === 'number' ? rdoc.status : parseInt(String(rdoc?.status), 10));
    const getRecordDetailUrl = (rid: string) =>
        UiContext.getRecordDetailUrl?.replace('%7Brid%7D', rid).replace('{rid}', rid) || `/record/${rid}`;

    const normalizeOutputForCompare = (s: string) => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');

    let pretestRidMap = new Map<string, number>();
    let pretestResults: (any | null)[] = [];
    let pretestTotal = 0;
    let pretestSubmitting = false;
    let pretestBatchSingleRid: string | null = null;
    let submitRid: string | null = null;
    let ws: WebSocket | null = null;

    const renderPretestResults = () => {
        setPassRate('');
        saveCases();
        let html = '<div class="pretest-multi-results">';
        let allPassed = true;
        for (let i = 0; i < pretestTotal; i++) {
            const rdoc = pretestResults[i];
            const caseData = cases[i];
            if (!rdoc) {
                html += `<div class="pretest-case-result"><div class="pretest-case-header"><span class="result-badge result-badge--pending">运行中</span><span class="pretest-case-title">用例 ${i + 1}</span></div></div>`;
                allPassed = false;
                continue;
            }
            const st = getRecordStatus(rdoc);
            const lb = LABEL[SN[st] || ''] || SN[st] || String(st);
            const tc0 = rdoc.testCases?.[0];
            const stdout = tc0?.message != null ? String(tc0.message) : '';
            const expected = caseData?.expected?.trim();
            const match = expected ? normalizeOutputForCompare(stdout) === normalizeOutputForCompare(caseData.expected) : true;
            if (st !== 1 || (expected && !match)) allPassed = false;
            const badge = st === 1 && match ? 'result-badge--ac' : (DONE.has(st) ? 'result-badge--err' : 'result-badge--pending');
            const badgeText = st === 1 && expected ? (match ? '输出一致' : '输出不一致') : escapeHtml(lb);
            html += `<div class="pretest-case-result"><div class="pretest-case-header"><span class="result-badge ${badge}">${badgeText}</span><span class="pretest-case-title">用例 ${i + 1}</span></div>`;
            html += '<div class="pretest-case-body">';
            if (expected) {
                html += '<div class="pretest-compare">';
                html += `<div class="pretest-section"><div class="pretest-section__label">实际输出</div><pre class="pretest-pre">${escapeHtml(stdout || '(无输出)')}</pre></div>`;
                html += `<div class="pretest-section"><div class="pretest-section__label">预期输出</div><pre class="pretest-pre">${escapeHtml(expected)}</pre></div>`;
                html += '</div>';
            } else {
                html += `<div class="pretest-section"><div class="pretest-section__label">输出</div><pre class="pretest-pre">${escapeHtml(stdout || '(无输出)')}</pre></div>`;
            }
            html += '</div></div>';
        }
        html += '</div>';
        outputEl.innerHTML = html;
        if (pretestRidMap.size > 0) {
            const done = pretestResults.filter((r) => r != null && DONE.has(getRecordStatus(r))).length;
            setStatus(`运行中 (${done}/${pretestTotal})…`, 'pending');
        } else {
            setStatus(allPassed ? '全部通过 ✓' : '存在未通过的用例 ✗', allPassed ? 'ok' : 'err');
        }
    };

    const hydrateBatch = (rdoc: any) => {
        const tcs = Array.isArray(rdoc?.testCases) ? rdoc.testCases : [];
        if (!tcs.length) { pretestResults[0] = rdoc; return; }
        for (let i = 0; i < Math.min(tcs.length, pretestTotal); i++) {
            const tc = tcs[i];
            pretestResults[i] = {
                ...rdoc,
                status: tc.status ?? rdoc.status,
                time: tc.time ?? rdoc.time,
                memory: tc.memory ?? rdoc.memory,
                testCases: [tc],
            };
        }
    };

    const finalizePretest = () => {
        renderPretestResults();
        finishBusy('run');
    };

    const fetchRecordByRid = async (rid: string): Promise<any | null> => {
        if (!rid) return null;
        try {
            const detail = await request.get(getRecordDetailUrl(rid)) as any;
            return detail?.rdoc ?? detail ?? null;
        } catch {
            return null;
        }
    };

    const buildFormalResultDetailHtml = (rdoc: any, rid: string): string => {
        const status: number = typeof rdoc.status === 'number' ? rdoc.status : parseInt(rdoc.status, 10);
        const name = SN[status] || `STATUS_${status}`;
        const label = LABEL[name] || name;
        const isAc = status === 1;
        const exam = rootEl.classList.contains('problem-ide-root--exam');
        let html = '<div class="result-detail">';
        html += '<div class="result-summary">';
        html += `<span class="result-badge ${isAc ? 'result-badge--ac' : 'result-badge--err'}">${escapeHtml(label)}</span>`;
        const parts: string[] = [];
        if (rdoc.score != null) parts.push(`分数: ${rdoc.score}`);
        if (rdoc.time != null) parts.push(`用时: ${rdoc.time}ms`);
        if (rdoc.memory != null) parts.push(`内存: ${(rdoc.memory / 1024).toFixed(1)}MB`);
        if (parts.length) html += `<span class="result-meta">${parts.join(' | ')}</span>`;
        html += '</div>';
        const ct = rdoc.compilerText || rdoc.compilerTexts;
        if (ct) {
            const ctStr = Array.isArray(ct) ? ct.filter(Boolean).join('\n') : String(ct);
            if (ctStr.trim()) html += `<div class="result-compiler"><pre>${escapeHtml(ctStr.trim())}</pre></div>`;
        }
        if (!exam && rdoc.testCases?.length) {
            const indexed = rdoc.testCases.map((tc: any, i: number) => ({ tc, i }));
            indexed.sort((a, b) => getCasePreviewFid(a.tc, a.i) - getCasePreviewFid(b.tc, b.i));
            html += '<table class="result-cases"><thead><tr><th>#</th><th>状态</th><th>用时</th><th>内存</th><th>分数</th><th>测试数据</th></tr></thead><tbody>';
            indexed.forEach(({ tc, i: origI }) => {
                const tcSt: number = typeof tc.status === 'number' ? tc.status : parseInt(tc.status, 10);
                const tcName = SN[tcSt] || 'UNKNOWN';
                const tcLabel = LABEL[tcName] || tcName;
                const tcAc = tcSt === 1;
                const caseNo = getCasePreviewFid(tc, origI);
                html += `<tr><td>${caseNo}</td>`;
                html += `<td class="${tcAc ? 'result-ac' : 'result-err'}">${escapeHtml(tcLabel)}</td>`;
                html += `<td>${tc.time != null ? `${tc.time}ms` : '-'}</td>`;
                html += `<td>${tc.memory != null ? `${(tc.memory / 1024).toFixed(1)}MB` : '-'}</td>`;
                html += `<td>${tc.score != null ? tc.score : '-'}</td>`;
                html += rid
                    ? `<td><a class="result-case-preview-btn" href="${escapeHtml(getRecordDetailUrl(rid))}" target="_blank" rel="noopener">预览</a></td>`
                    : '<td>—</td>';
                html += '</tr>';
            });
            html += '</tbody></table>';
        }
        html += '</div>';
        return html;
    };

    const renderSubmitResult = (rdoc: any) => {
        const rid = String(rdoc._id ?? '');
        const st = getRecordStatus(rdoc);
        const lb = LABEL[SN[st] || ''] || SN[st] || String(st);
        outputEl.innerHTML = buildFormalResultDetailHtml(rdoc, rid);
        const tcs = Array.isArray(rdoc?.testCases) ? rdoc.testCases : [];
        if (tcs.length) {
            const passed = tcs.filter((tc: any) => {
                const tcStatus = typeof tc?.status === 'number' ? tc.status : parseInt(String(tc?.status), 10);
                return tcStatus === 1;
            }).length;
            setPassRate(`通过率: ${Math.round((passed / tcs.length) * 100)}%`, st === 1 ? 'ok' : 'err');
        } else {
            setPassRate(st === 1 ? '通过率: 100%' : '通过率: 0%', st === 1 ? 'ok' : 'err');
        }
        setStatus(lb, st === 1 ? 'ok' : 'err');
    };

    const handleWsMsg = (rdoc: any) => {
        if (!rdoc?._id) return;
        const rid = normalizeRid(rdoc._id);
        const status = getRecordStatus(rdoc);
        if (pretestRidMap.has(rid)) {
            const idx = pretestRidMap.get(rid)!;
            if (PROGRESS.has(status)) {
                if (pretestBatchSingleRid === rid) hydrateBatch(rdoc);
                else pretestResults[idx] = rdoc;
                renderPretestResults();
                return;
            }
            if (DONE.has(status)) {
                pretestRidMap.delete(rid);
                if (pretestBatchSingleRid === rid) {
                    hydrateBatch(rdoc);
                    pretestBatchSingleRid = null;
                    finalizePretest();
                    return;
                }
                pretestResults[idx] = rdoc;
                if (pretestRidMap.size === 0 && !pretestSubmitting) finalizePretest();
                else renderPretestResults();
            }
            return;
        }
        if (submitRid && rid === submitRid && DONE.has(status)) {
            const captured = rid;
            submitRid = null;
            void (async () => {
                const full = await fetchRecordByRid(captured);
                renderSubmitResult(full || rdoc);
                finishBusy('submit');
                void loadHistory();
            })();
        }
    };

    const connectWs = () => {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
        const path = UiContext.pretestConnUrl;
        if (!path) return;
        try {
            const socket = new WebSocket(`${getWsPrefix()}${path}`);
            ws = socket;
            socket.onmessage = (ev) => {
                if (ev.data === 'ping') { try { socket.send('pong'); } catch { /* ignore */ } return; }
                try {
                    const parsed = JSON.parse(ev.data as string);
                    handleWsMsg(parsed.rdoc || parsed);
                } catch { /* ignore */ }
            };
            socket.onclose = () => { if (ws === socket) ws = null; };
        } catch { /* ignore */ }
    };
    connectWs();

    const collectRids = (res: Record<string, unknown>) => {
        const out: string[] = [];
        const push = (v: unknown) => { const r = normalizeRid(v); if (r) out.push(r); };
        push(res.rid);
        if (Array.isArray((res as { rids?: unknown }).rids)) {
            for (const r of (res as { rids: unknown[] }).rids) push(r);
        }
        return [...new Set(out)];
    };

    const requireLogin = () => {
        if (!ideCanSubmit) {
            if (typeof window.showSignInDialog === 'function') window.showSignInDialog();
            else Notification.info('请先登录');
            return true;
        }
        return false;
    };

    runBtn.addEventListener('click', async () => {
        if (requireLogin() || !UiContext.postSubmitUrl || runBtn.disabled) return;
        saveCases();
        const code = editor.getValue();
        if (!code.trim()) {
            switchTab('result'); expandDrawer();
            setStatus('请先输入代码', 'err');
            outputEl.textContent = '';
            return;
        }
        runBusy = true; syncBtns();
        switchTab('result'); expandDrawer();
        pretestRidMap.clear();
        pretestBatchSingleRid = null;
        pretestTotal = cases.length;
        pretestResults = new Array(cases.length).fill(null);
        setStatus('正在运行自测…', 'pending');
        setPassRate('');
        outputEl.textContent = '';
        try {
            pretestSubmitting = true;
            const payload: Record<string, unknown> = {
                lang: langEl.value, code, pretest: true,
                input: cases.map((c) => c.input || '\n'),
            };
            if (UiContext.tdoc?.docId) payload.tid = UiContext.tdoc.docId;
            const res = await promiseWithTimeout(
                request.post(UiContext.postSubmitUrl, payload) as Promise<Record<string, unknown>>,
                SUBMIT_HTTP_TIMEOUT_MS, '自测请求',
            );
            const rids = collectRids(res);
            if (rids.length === cases.length) {
                rids.forEach((rid, i) => pretestRidMap.set(rid, i));
            } else if (rids.length === 1) {
                pretestBatchSingleRid = rids[0];
                pretestRidMap.set(rids[0], 0);
            }
            pretestSubmitting = false;
            connectWs();
            if (pretestRidMap.size === 0) {
                setStatus('异常响应', 'err');
                outputEl.textContent = `服务器未返回 rid\n${JSON.stringify(res, null, 2)}`;
                finishBusy('run');
            } else setStatus(`运行中 (0/${pretestTotal})…`, 'pending');
        } catch (e: unknown) {
            pretestSubmitting = false;
            setStatus('请求失败', 'err');
            outputEl.textContent = e instanceof Error ? e.message : String(e);
            finishBusy('run');
        }
    });

    submitBtn.addEventListener('click', async () => {
        if (requireLogin() || !UiContext.postSubmitUrl || submitBtn.disabled) return;
        const code = editor.getValue();
        if (!code.trim()) {
            switchTab('result'); expandDrawer();
            setStatus('请先输入代码', 'err');
            outputEl.textContent = '';
            return;
        }
        submitBusy = true; syncBtns();
        switchTab('result'); expandDrawer();
        setStatus('提交中…', 'pending');
        setPassRate('');
        outputEl.innerHTML = '';
        try {
            const payload: Record<string, unknown> = { lang: langEl.value, code, pretest: false };
            if (UiContext.tdoc?.docId) payload.tid = UiContext.tdoc.docId;
            const res = await promiseWithTimeout(
                request.post(UiContext.postSubmitUrl, payload) as Promise<Record<string, unknown>>,
                SUBMIT_HTTP_TIMEOUT_MS, '提交请求',
            );
            const rid = collectRids(res)[0];
            if (rid) {
                submitRid = rid;
                connectWs();
                setStatus('评测中…', 'pending');
            } else {
                setStatus('提交失败', 'err');
                outputEl.textContent = JSON.stringify(res, null, 2);
                finishBusy('submit');
            }
        } catch (e: unknown) {
            setStatus('请求失败', 'err');
            outputEl.textContent = e instanceof Error ? e.message : String(e);
            finishBusy('submit');
        }
    });

    async function loadHistory() {
        if (!historyEl) return;
        if (ideLoginRequired) {
            historyEl.innerHTML = '<div class="history-empty">登录后查看自己的提交记录</div>';
            return;
        }
        if (!UiContext.getSubmissionsUrl) return;
        historyEl.innerHTML = '<div class="history-loading">加载中…</div>';
        try {
            const u = new URL(UiContext.getSubmissionsUrl, window.location.origin);
            u.searchParams.set('page', '1');
            const res = await request.get(u.pathname + u.search) as any;
            const rdocs: any[] = res.rdocs || [];
            if (!rdocs.length) {
                historyEl.innerHTML = '<div class="history-empty">暂无提交记录</div>';
                return;
            }
            let html = '<table class="history-table"><thead><tr><th>时间</th><th>结果</th><th>分数</th><th>语言</th></tr></thead><tbody>';
            for (const r of rdocs) {
                const st = getRecordStatus(r);
                const lb = LABEL[SN[st] || ''] || String(st);
                const t = r.judgeAt ? new Date(r.judgeAt).toLocaleString() : '-';
                const href = getRecordDetailUrl(String(r._id));
                html += `<tr class="history-row" data-href="${escapeHtml(href)}"><td>${escapeHtml(t)}</td>`;
                html += `<td class="${st === 1 ? 'result-ac' : 'result-err'}">${escapeHtml(lb)}</td>`;
                html += `<td>${r.score != null ? escapeHtml(String(r.score)) : '-'}</td>`;
                html += `<td>${escapeHtml(langRange[r.lang] || r.lang || '-')}</td></tr>`;
            }
            html += '</tbody></table>';
            historyEl.innerHTML = html;
            historyEl.querySelectorAll('.history-row').forEach((row) => {
                row.addEventListener('click', () => {
                    const href = (row as HTMLElement).dataset.href;
                    if (href) window.open(href, '_blank');
                });
            });
        } catch (e) {
            historyEl.innerHTML = `<div class="history-empty">加载失败: ${escapeHtml(e instanceof Error ? e.message : String(e))}</div>`;
        }
    }

    $(window).on('resize', () => editor.layout());
}));
