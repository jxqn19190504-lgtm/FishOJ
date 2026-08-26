/**
 * ProblemIde 教学扩展协议（公开，其它 addon 只依赖事件名与 snapshot，禁止 import 本文件）。
 * 事件均挂在 document 上。
 */

export const PROBLEM_IDE_EVENTS = {
    CODE_CHANGE: 'problem-ide-code-change',
    LANGUAGE_CHANGE: 'problem-ide-language-change',
    RUN_START: 'problem-ide-run-start',
    RUN_RESULT: 'problem-ide-run-result',
    SUBMIT_RESULT: 'problem-ide-submit-result',
    APPLY_CODE: 'problem-ide-apply-code',
    APPLY_CODE_BLOCKED: 'problem-ide-apply-code-blocked',
    RUN_REQUEST: 'problem-ide-run-request',
    HINT_REQUEST: 'problem-ide-hint-request',
    SCAFFOLD_REQUEST: 'problem-ide-scaffold-request',
    READY: 'problem-ide-ready',
} as const;

export type ProblemIdeRunType = 'pretest' | 'submit';

export type ProblemIdeRunSnapshot = {
    type: ProblemIdeRunType;
    input?: string;
    expected?: string;
    stdout?: string;
    stderr?: string;
    status?: string;
    time?: number;
    memory?: number;
};

export type ProblemIdeSnapshot = {
    pid: string;
    language: string;
    code: string;
    cursor?: { line: number; column: number };
    cases: Array<{ input: string; expected: string }>;
    lastRun?: ProblemIdeRunSnapshot;
};

declare global {
    interface Window {
        FishOJProblemIde?: {
            getSnapshot: () => ProblemIdeSnapshot;
            hasMeaningfulCode: () => boolean;
        };
    }
}

function emit(name: string, detail?: unknown) {
    try {
        document.dispatchEvent(new CustomEvent(name, { detail }));
    } catch { /* ignore */ }
}

export function codeLooksEmpty(code: string): boolean {
    const stripped = code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/#.*$/gm, '')
        .replace(/Write your code here/gi, '')
        .replace(/TODO/gi, '')
        .replace(/_{2,}/g, '')
        .replace(/\s+/g, '')
        .trim();
    return stripped.length === 0;
}

export function installProblemIdeHost(opts: {
    pid: string;
    editor: {
        getValue: () => string;
        setValue?: (v: string) => void;
        getModel?: () => { getValue: () => string } | null;
        getPosition?: () => { lineNumber: number; column: number } | null;
    };
    langEl: HTMLSelectElement;
    getCases: () => Array<{ input: string; expected: string }>;
    templateFor: (lang: string) => string;
    persistCode: (lang: string, code: string) => void;
}) {
    const { pid, editor, langEl, getCases, templateFor, persistCode } = opts;

    const getCode = () => editor.getValue();
    const setCode = (code: string) => {
        if (typeof editor.setValue === 'function') editor.setValue(code);
        persistCode(langEl.value, code);
    };

    const getSnapshot = (): ProblemIdeSnapshot => {
        const pos = editor.getPosition?.();
        return {
            pid,
            language: langEl.value,
            code: getCode(),
            cursor: pos ? { line: pos.lineNumber, column: pos.column } : undefined,
            cases: getCases(),
            lastRun: lastRun || undefined,
        };
    };

    let lastRun: ProblemIdeRunSnapshot | null = null;

    const hasMeaningfulCode = () => {
        const code = getCode();
        if (codeLooksEmpty(code)) return false;
        const tpl = templateFor(langEl.value) || '';
        if (tpl && code.trim() === tpl.trim()) return false;
        return true;
    };

    window.FishOJProblemIde = { getSnapshot, hasMeaningfulCode };

    document.addEventListener(PROBLEM_IDE_EVENTS.APPLY_CODE, ((ev: Event) => {
        const detail = (ev as CustomEvent<{
            code?: string;
            force?: boolean;
            language?: string;
        }>).detail || {};
        const next = String(detail.code ?? '');
        if (detail.language && detail.language !== langEl.value) return;
        if (!detail.force && hasMeaningfulCode()) {
            emit(PROBLEM_IDE_EVENTS.APPLY_CODE_BLOCKED, {
                current: getCode(),
                requested: next,
            });
            return;
        }
        setCode(next);
        emit(PROBLEM_IDE_EVENTS.CODE_CHANGE, {
            language: langEl.value,
            code: next,
            source: 'apply-code',
        });
    }) as EventListener);

    document.addEventListener(PROBLEM_IDE_EVENTS.RUN_RESULT, ((ev: Event) => {
        const detail = (ev as CustomEvent<ProblemIdeRunSnapshot>).detail;
        if (detail) lastRun = detail;
    }) as EventListener);

    document.addEventListener(PROBLEM_IDE_EVENTS.SUBMIT_RESULT, ((ev: Event) => {
        const detail = (ev as CustomEvent<ProblemIdeRunSnapshot>).detail;
        if (detail) lastRun = { ...detail, type: 'submit' };
    }) as EventListener);

    emit(PROBLEM_IDE_EVENTS.READY, { pid, language: langEl.value });
}

export function emitProblemIdeEvent(name: string, detail?: unknown) {
    emit(name, detail);
}
