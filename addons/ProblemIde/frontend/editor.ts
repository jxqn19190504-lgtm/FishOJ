import { FS_KEY, THEME_KEY } from './constants';
import { mapMonacoLang } from './monaco';
import { resolveUserCodeTemplateString } from './codeTemplate';

declare const UiContext: {
    codeTemplate?: Record<string, string> | string;
};

export function setupMonacoEditor(opts: {
    monaco: typeof import('monaco-editor');
    monacoEl: HTMLElement;
    langEl: HTMLSelectElement;
    fontInput: HTMLInputElement | null;
    themeSelect: HTMLSelectElement | null;
    settingsBtn: HTMLElement | null;
    settingsPanel: HTMLElement | null;
    resetBtn: HTMLButtonElement | null;
    defaultLang: string;
    codeKey: (lang: string) => string;
    langKey: string;
}) {
    const {
        monaco, monacoEl, langEl, fontInput, themeSelect, settingsBtn, settingsPanel,
        resetBtn, defaultLang, codeKey, langKey,
    } = opts;
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
        model: monaco.editor.createModel(initialCode, mapMonacoLang(defaultLang)),
        theme: currentTheme,
        fontSize,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        padding: { top: 8 },
        lineNumbersMinChars: 3,
        renderLineHighlight: 'line',
    });
    let codeChangeTimer = 0;
    const emitCodeChange = (source: string) => {
        window.clearTimeout(codeChangeTimer);
        codeChangeTimer = window.setTimeout(() => {
            try {
                document.dispatchEvent(new CustomEvent('problem-ide-code-change', {
                    detail: { language: langEl.value, code: editor.getValue(), source },
                }));
            } catch { /* ignore */ }
        }, 400);
    };
    editor.onDidChangeModelContent(() => {
        localStorage.setItem(codeKey(langEl.value), editor.getValue());
        emitCodeChange('edit');
    });
    langEl.addEventListener('change', () => {
        localStorage.setItem(langKey, langEl.value);
        const next = localStorage.getItem(codeKey(langEl.value)) ?? templateFor(langEl.value);
        editor.setModel(monaco.editor.createModel(next, mapMonacoLang(langEl.value)));
        try {
            document.dispatchEvent(new CustomEvent('problem-ide-language-change', {
                detail: { language: langEl.value, code: next },
            }));
        } catch { /* ignore */ }
    });
    resetBtn?.addEventListener('click', () => {
        if (!window.confirm('确定重置为初始代码模板？')) return;
        const filled = templateFor(langEl.value);
        editor.setModel(monaco.editor.createModel(filled, mapMonacoLang(langEl.value)));
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
    return editor;
}

export function applyProblemModeTags(cfg: Record<string, unknown>) {
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
}
