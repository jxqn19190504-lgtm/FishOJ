/**
 * 提交记录 AI 分析 SSE 客户端（与 code_review / 选择题流式解析一致）
 */

import {
    computeLineDiff,
    findSnippetStartLine,
    parseRecordAiRepairPayload,
    type RecordAiRepairHunk,
    type RecordAiRepairPayload,
} from './repairProtocol';

export type CodeAiDailyLimitTiers = {
    nonVip: number;
    linkedPset: number;
    vip: number;
};

export const CODE_AI_DAILY_LIMIT_DEFAULTS: CodeAiDailyLimitTiers = {
    nonVip: 5,
    linkedPset: 10,
    vip: 50,
};

let codeAiDailyLimitDisplayTiers: CodeAiDailyLimitTiers = { ...CODE_AI_DAILY_LIMIT_DEFAULTS };

export function setCodeAiDailyLimitDisplayTiers(tiers: Partial<CodeAiDailyLimitTiers>): void {
    codeAiDailyLimitDisplayTiers = { ...codeAiDailyLimitDisplayTiers, ...tiers };
}

export function getCodeAiDailyLimitDisplayTiers(): CodeAiDailyLimitTiers {
    return codeAiDailyLimitDisplayTiers;
}

function resolveCodeAiDailyLimitTiers(
    tiers?: Partial<CodeAiDailyLimitTiers> | null,
): CodeAiDailyLimitTiers {
    if (!tiers) return codeAiDailyLimitDisplayTiers;
    return {
        nonVip: tiers.nonVip ?? codeAiDailyLimitDisplayTiers.nonVip,
        linkedPset: tiers.linkedPset ?? codeAiDailyLimitDisplayTiers.linkedPset,
        vip: tiers.vip ?? codeAiDailyLimitDisplayTiers.vip,
    };
}

export type AiAnalysisQuotaRef = {
    limited: boolean;
    remaining: number;
    dailyLimit: number | null;
    limitTiers?: CodeAiDailyLimitTiers;
    /** ai_quota = 钱包点数；daily_count / 缺省 = 旧日次数 */
    source?: 'ai_quota' | 'daily_count' | string;
    balancePoints?: number | null;
    balanceMicro?: number | null;
    estimatedCostPoints?: number | null;
    estimatedCostMicro?: number | null;
    canUsePaidAnalysis?: boolean;
    unlimited?: boolean;
    byokAvailable?: boolean;
    reason?: string | null;
    quotaPageUrl?: string | null;
    isVip?: boolean;
};
export type RecordAiPromptVars = {
    problem_content?: string;
    submit_code?: string;
    /** @deprecated 已废弃：官方题解改由服务端拉取，不再经模板传参 */
    problem_textsol?: string;
    judge_result?: string;
};

export const RECORD_AI_ANALYSIS_STREAM_URL = '/ai-analysis/stream';

export const RECORD_AI_ANALYSIS_CACHE_URL = '/ai-analysis/cache';

export const RECORD_AI_ANALYSIS_QUOTA_URL = '/ai-analysis/quota';

/** 流式分析进行中：暂停或关页不退回已预扣额度（与官方 Key 服务端策略一致，供各入口复用） */
export const RECORD_AI_PAUSE_OR_LEAVE_NON_REFUND_HINT_ZH =
    '暂停AI分析/关闭网页不退回已消耗的 AI 点数';

/** 查询该提交是否已有服务端缓存的 AI 分析（不扣次） */
export async function fetchRecordAiAnalysisCache(
    rid: string,
    cacheUrl?: string,
): Promise<{ hasCache: boolean; contentHtml?: string }> {
    const base = cacheUrl || RECORD_AI_ANALYSIS_CACHE_URL;
    const u = `${base}?rid=${encodeURIComponent(rid)}`;
    try {
        const res = await fetch(u, { credentials: 'same-origin' });
        if (!res.ok) return { hasCache: false };
        const data = (await res.json()) as { hasCache?: boolean; contentHtml?: string };
        if (data?.hasCache && typeof data.contentHtml === 'string' && data.contentHtml.trim()) {
            return { hasCache: true, contentHtml: data.contentHtml };
        }
        return { hasCache: false };
    } catch {
        return { hasCache: false };
    }
}

/**
 * 将缓存的 AI 分析 HTML 写入右侧面板（与流式成功结束态一致，便于共用样式与代码块增强）。
 */
export function renderRecordAiCachedAnalysisIntoStreamRoot(
    streamRoot: HTMLElement,
    contentHtml: string,
    opts?: { submitCode?: string; language?: string },
): void {
    ensureRecordAiMarkdownCodeBlockStyles();
    const liveId = 'recordAiStreamLive';
    streamRoot.classList.remove('is-loading', 'record-ai-stream-panel--await-start');
    streamRoot.classList.add('is-result');
    streamRoot.innerHTML = `<div id="${liveId}" class="markdown-body reviewmodal__ai-live ${RECORD_AI_STREAM_MD_CLASS}" style="min-height:4em;line-height:1.55;"><div class="markdown-body">${contentHtml}</div></div>`;
    const liveEl = streamRoot.querySelector(`#${liveId}`) as HTMLElement | null;
    if (liveEl) {
        enhanceRecordAiAnalysisResultDom(liveEl, { submitCode: opts?.submitCode });
        mountRecordAiSubmitCodeCollapse(liveEl, opts?.submitCode, { language: opts?.language });
    }
}

function normalizeSubmitCodeLangKey(language?: string): string {
    const l = String(language || '').trim().toLowerCase();
    if (!l) return '';
    if (l.startsWith('cc') || l.includes('cpp') || l.includes('c++') || l === 'g++') return 'cpp';
    if (l.startsWith('py') || l.includes('python')) return 'python';
    if (l.startsWith('java')) return 'java';
    if (l.startsWith('js') || l.includes('node') || l.includes('javascript')) return 'javascript';
    if (l.startsWith('ts') || l.includes('typescript')) return 'typescript';
    if (l.startsWith('go')) return 'go';
    if (l.startsWith('rs') || l.includes('rust')) return 'rust';
    if (l.startsWith('c.') || l === 'c') return 'c';
    const head = l.split(/[./]/)[0];
    return head || l;
}

function countCodeLines(code: string): number {
    if (!code) return 0;
    const parts = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (parts.length && parts[parts.length - 1] === '') return Math.max(0, parts.length - 1);
    return parts.length;
}

type SubmitCodeMonacoEditor = {
    layout: () => void;
    dispose: () => void;
    setValue?: (v: string) => void;
};

function disposeRecordAiSubmitCodeEditors(scope: ParentNode): void {
    scope.querySelectorAll('.record-ai-submit-code').forEach((node) => {
        const host = node as HTMLElement & { __submitMonaco?: SubmitCodeMonacoEditor | null };
        try {
            host.__submitMonaco?.dispose();
        } catch {
            /* ignore */
        }
        host.__submitMonaco = null;
    });
}

function resolveSubmitCodeMonacoTheme(): string {
    const themeSelect = document.getElementById('problemIdeTheme') as HTMLSelectElement | null;
    const fromSelect = String(themeSelect?.value || '').trim();
    if (fromSelect) return fromSelect;
    const dark = document.documentElement.classList.contains('theme--dark')
        || document.body.classList.contains('theme--dark');
    return dark ? 'vs-dark' : 'vs';
}

function getWindowMonaco(): any | null {
    const w = window as unknown as { monaco?: any };
    return w.monaco || null;
}

/** 若页面尚未加载 Monaco，按与题面 IDE 相同的源尝试拉取（幂等） */
let submitCodeMonacoPromise: Promise<any | null> | null = null;

function ensureMonacoForSubmitCode(): Promise<any | null> {
    const existing = getWindowMonaco();
    if (existing) return Promise.resolve(existing);
    if (submitCodeMonacoPromise) return submitCodeMonacoPromise;

    submitCodeMonacoPromise = (async () => {
        const bases = [
            '/monaco/vs',
            'https://cdn.jsdelivr.net/npm/monaco-editor@0.54.0/min/vs',
            'https://unpkg.com/monaco-editor@0.54.0/min/vs',
        ];
        for (const base of bases) {
            try {
                await new Promise<void>((resolve, reject) => {
                    const w = window as unknown as { require?: any; monaco?: any };
                    if (w.monaco) {
                        resolve();
                        return;
                    }
                    const script = document.createElement('script');
                    script.src = `${base}/loader.js`;
                    script.onload = () => {
                        if (!w.require) {
                            reject(new Error('no require'));
                            return;
                        }
                        w.require.config({ paths: { vs: base } });
                        w.require(
                            ['vs/editor/editor.main'],
                            () => (w.monaco ? resolve() : reject(new Error('no monaco'))),
                            reject,
                        );
                    };
                    script.onerror = () => reject(new Error(`load fail ${base}`));
                    document.head.appendChild(script);
                });
                const m = getWindowMonaco();
                if (m) return m;
            } catch {
                /* try next */
            }
        }
        return null;
    })();

    return submitCodeMonacoPromise;
}

function mountSubmitCodeFallback(body: HTMLElement, code: string, langKey: string): void {
    body.innerHTML = '';
    const pre = document.createElement('pre');
    pre.className = 'record-ai-submit-code__fallback';
    const codeEl = document.createElement('code');
    if (langKey) codeEl.className = `language-${langKey}`;
    codeEl.textContent = code;
    pre.appendChild(codeEl);
    body.appendChild(pre);
    highlightRecordAiCodeIfAvailable(codeEl);
}

/**
 * 在 AI 分析内容最上方挂载可展开的「提交代码」块（默认折叠，展开后为只读 Monaco IDE）。
 * @param opts.open 是否默认展开（用于流结束重建时保留用户展开态）
 */
export function mountRecordAiSubmitCodeCollapse(
    root: HTMLElement | null,
    submitCode?: string,
    opts?: { language?: string; open?: boolean },
): void {
    if (!root) return;
    const code = String(submitCode || '');
    disposeRecordAiSubmitCodeEditors(root);
    root.querySelectorAll('.record-ai-submit-code').forEach((el) => el.remove());
    if (!code.trim()) return;

    ensureRecordAiMarkdownCodeBlockStyles();
    const langKey = normalizeSubmitCodeLangKey(opts?.language) || 'cpp';
    const langLabel = LANG_LABEL[langKey] || langKey.toUpperCase();
    const lines = countCodeLines(code);
    const metaBits = [langLabel, lines > 0 ? `${lines} 行` : ''].filter(Boolean);

    const details = document.createElement('details') as HTMLDetailsElement & {
        __submitMonaco?: SubmitCodeMonacoEditor | null;
    };
    details.className = 'record-ai-submit-code';
    if (opts?.open) details.open = true;

    const summary = document.createElement('summary');
    summary.className = 'record-ai-submit-code__summary';
    summary.innerHTML = `
      <span class="record-ai-submit-code__chevron" aria-hidden="true">▸</span>
      <span class="record-ai-submit-code__label">提交代码</span>
      ${metaBits.length ? `<span class="record-ai-submit-code__meta">${escapeHtml(metaBits.join(' · '))}</span>` : ''}
    `;

    const body = document.createElement('div');
    body.className = 'record-ai-submit-code__body';
    const monacoHost = document.createElement('div');
    monacoHost.className = 'record-ai-submit-code__monaco';
    body.appendChild(monacoHost);
    details.appendChild(summary);
    details.appendChild(body);

    let initStarted = false;
    const ensureReadonlyIde = () => {
        if (details.__submitMonaco) {
            try {
                details.__submitMonaco.layout();
            } catch {
                /* ignore */
            }
            return;
        }
        if (initStarted) return;
        initStarted = true;
        void ensureMonacoForSubmitCode().then((monaco) => {
            if (!details.isConnected) return;
            if (!monaco?.editor?.create) {
                mountSubmitCodeFallback(body, code, langKey);
                return;
            }
            try {
                const editor = monaco.editor.create(monacoHost, {
                    value: code,
                    language: langKey,
                    theme: resolveSubmitCodeMonacoTheme(),
                    readOnly: true,
                    domReadOnly: true,
                    automaticLayout: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 8, bottom: 8 },
                    lineNumbers: 'on',
                    lineNumbersMinChars: 3,
                    renderLineHighlight: 'line',
                    fontSize: 13,
                    wordWrap: 'off',
                    contextmenu: false,
                    quickSuggestions: false,
                    suggestOnTriggerCharacters: false,
                    parameterHints: { enabled: false },
                    hover: { enabled: true },
                    folding: true,
                    stickyScroll: { enabled: false },
                });
                details.__submitMonaco = editor;
                window.requestAnimationFrame(() => {
                    try {
                        editor.layout();
                    } catch {
                        /* ignore */
                    }
                });
            } catch {
                mountSubmitCodeFallback(body, code, langKey);
            }
        });
    };

    details.addEventListener('toggle', () => {
        if (details.open) ensureReadonlyIde();
    });

    root.insertBefore(details, root.firstChild);
    if (details.open) ensureReadonlyIde();
}

/** 无历史记录时：右侧展示「开始 AI 分析」按钮，点击后由 onStart 发起流式请求 */
export function mountRecordAiAnalysisAwaitStartUI(
    streamRoot: HTMLElement,
    onStart: () => void | Promise<void>,
): void {
    streamRoot.classList.remove('is-loading', 'is-result');
    streamRoot.classList.add('record-ai-stream-panel--await-start');
    streamRoot.innerHTML = `<div class="record-ai-await-start">
    <button type="button" class="record-ai-await-start__btn">开始 AI 分析</button>
  </div>`;
    const btn = streamRoot.querySelector('.record-ai-await-start__btn') as HTMLButtonElement | null;
    if (!btn) return;
    btn.addEventListener('click', () => {
        void (async () => {
            btn.disabled = true;
            try {
                await onStart();
            } finally {
                btn.disabled = false;
            }
        })();
    });
}

export function normalizeCodeAiDailyLimit(
    n: unknown,
    fallback = CODE_AI_DAILY_LIMIT_DEFAULTS.nonVip,
): number {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function isAiQuotaWalletRef(ref: AiAnalysisQuotaRef | null | undefined): boolean {
    return !!ref && (ref.source === 'ai_quota' || ref.unlimited === true || ref.estimatedCostPoints != null);
}

export function parseAiAnalysisQuotaRef(raw: unknown): AiAnalysisQuotaRef | null {
    if (!raw || typeof raw !== 'object') return null;
    const ref = raw as AiAnalysisQuotaRef;
    const source = ref.source === 'ai_quota' || ref.source === 'daily_count' ? ref.source : undefined;
    const isWallet = source === 'ai_quota'
        || ref.unlimited === true
        || typeof ref.estimatedCostPoints === 'number'
        || typeof ref.balancePoints === 'number';

    const limitTiers = ref.limitTiers
        ? {
              nonVip: normalizeCodeAiDailyLimit(ref.limitTiers.nonVip, CODE_AI_DAILY_LIMIT_DEFAULTS.nonVip),
              linkedPset: normalizeCodeAiDailyLimit(
                  ref.limitTiers.linkedPset,
                  CODE_AI_DAILY_LIMIT_DEFAULTS.linkedPset,
              ),
              vip: normalizeCodeAiDailyLimit(ref.limitTiers.vip, CODE_AI_DAILY_LIMIT_DEFAULTS.vip),
          }
        : undefined;
    if (limitTiers) setCodeAiDailyLimitDisplayTiers(limitTiers);

    if (isWallet) {
        const unlimited = !!ref.unlimited;
        const balancePoints = unlimited
            ? null
            : (ref.balancePoints != null
                ? Number(ref.balancePoints)
                : (ref.remaining != null ? Number(ref.remaining) : 0));
        return {
            source: 'ai_quota',
            limited: !unlimited,
            remaining: balancePoints == null ? 0 : balancePoints,
            dailyLimit: null,
            balancePoints,
            balanceMicro: ref.balanceMicro != null ? Number(ref.balanceMicro) : null,
            estimatedCostPoints: ref.estimatedCostPoints != null ? Number(ref.estimatedCostPoints) : null,
            estimatedCostMicro: ref.estimatedCostMicro != null ? Number(ref.estimatedCostMicro) : null,
            canUsePaidAnalysis: ref.canUsePaidAnalysis !== false && (unlimited || (balancePoints != null
                && (ref.estimatedCostPoints == null || balancePoints >= Number(ref.estimatedCostPoints)))),
            unlimited,
            byokAvailable: !!ref.byokAvailable,
            reason: ref.reason ?? null,
            quotaPageUrl: ref.quotaPageUrl || '/ai-quota',
            isVip: !!ref.isVip,
            ...(limitTiers ? { limitTiers } : {}),
        };
    }

    if (!ref.limited) return null;
    return {
        source: source || 'daily_count',
        limited: true,
        remaining: Number(ref.remaining) || 0,
        dailyLimit: normalizeCodeAiDailyLimit(ref.dailyLimit),
        ...(limitTiers ? { limitTiers } : {}),
    };
}

function escapeQuotaHtml(s: string): string {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export type AiQuotaWalletBarOpts = {
    /** 追加到额度链接上的 class（默认仅 ai-quota-link） */
    linkClass?: string;
    /** @deprecated 已与 AI 助教同构，不再展示缓存提示 */
    showCacheFreeHint?: boolean;
    /** 追加冷却等文案 */
    cooldownText?: string | null;
    /** 外层包装 class，默认 ai-analysis-quota-bar__inner */
    wrapClass?: string;
};

const AI_QUOTA_LINK_ICON_SVG = '<svg class="ai-quota-link__icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

/**
 * 统一 AI 点数余额展示（与 AI 助教右下角同构：额度：不限 / 数字）。
 * 返回可直接写入 innerHTML 的片段（含外层 wrap）。
 */
export function buildAiQuotaWalletBarHtml(
    ref: AiAnalysisQuotaRef,
    opts?: AiQuotaWalletBarOpts,
): string {
    const extraLinkClass = String(opts?.linkClass || '').trim();
    const linkClass = extraLinkClass
        ? `ai-quota-link ${extraLinkClass}`
        : 'ai-quota-link';
    const wrapClass = opts?.wrapClass || 'ai-analysis-quota-bar__inner';
    const page = escapeQuotaHtml(ref.quotaPageUrl || '/ai-quota');
    const cost = ref.estimatedCostPoints != null && Number.isFinite(Number(ref.estimatedCostPoints))
        ? Math.max(0, Math.floor(Number(ref.estimatedCostPoints)))
        : null;
    const bal = ref.balancePoints != null
        ? Math.max(0, Math.floor(Number(ref.balancePoints)))
        : Math.max(0, Math.floor(Number(ref.remaining) || 0));
    const insufficient = !ref.unlimited && (
        ref.canUsePaidAnalysis === false
        || (cost != null && bal < cost)
    );
    const valueText = ref.unlimited
        ? '不限'
        : String(bal);
    const valueClass = insufficient
        ? 'ai-quota-link__value ai-quota-link__value--low'
        : 'ai-quota-link__value';
    const cool = String(opts?.cooldownText || '').trim();
    const coolHtml = cool
        ? `<span class="ai-quota-link__cool">· ${escapeQuotaHtml(cool)}</span>`
        : '';
    return (
        `<div class="${wrapClass} ai-quota-meta">`
        + `<a class="${linkClass}" href="${page}" target="_blank" rel="noopener noreferrer" title="查看 AI 额度中心">`
        + `<span class="ai-quota-link__label">额度</span>`
        + `<span class="${valueClass}">${valueText}</span>`
        + AI_QUOTA_LINK_ICON_SVG
        + `</a>${coolHtml}</div>`
    );
}

/** 限额条右侧文案（旧日次数路径；钱包路径请用 {@link buildAiQuotaWalletBarHtml}） */
export function codeAiQuotaBarTailHtml(
    dailyLimit: unknown,
    opts?: {
        vipClass?: string;
        limitTiers?: Partial<CodeAiDailyLimitTiers>;
        quotaRef?: AiAnalysisQuotaRef | null;
    },
): string {
    const ref = opts?.quotaRef;
    if (ref && isAiQuotaWalletRef(ref)) {
        // 兼容旧调用：钱包完整展示由 buildAiQuotaWalletBarHtml 负责
        const page = ref.quotaPageUrl || '/ai-quota';
        return ` · <a href="${page}" class="${opts?.vipClass ?? 'ai-analysis-quota-bar__vip-link'}">额度中心</a>`;
    }
    const tiers = resolveCodeAiDailyLimitTiers(opts?.limitTiers);
    const lim = normalizeCodeAiDailyLimit(dailyLimit, tiers.nonVip);
    const vipClass = opts?.vipClass ?? 'ai-analysis-quota-bar__vip-link';
    if (lim < tiers.vip) {
        return `，<a href="/vip" class="${vipClass}"><strong>开通会员</strong></a>可享每日 ${tiers.vip} 次`;
    }
    return '，额度明日刷新';
}

function resolveQuotaCenterPage(quotaRef?: AiAnalysisQuotaRef | null, fallback?: string | null): string {
    const fromRef = String(quotaRef?.quotaPageUrl || '').trim();
    if (fromRef.startsWith('/')) return fromRef;
    const fromFallback = String(fallback || '').trim();
    if (fromFallback.startsWith('/')) return fromFallback;
    return '/ai-quota';
}

function quotaCenterCtaHtml(page: string): string {
    const href = escapeQuotaHtml(page);
    return `<br/><a href="${href}" class="ai-analysis-quota-bar__vip-link ai-analysis-quota-bar__cta" `
        + `style="display:inline-block;margin-top:10px;padding:6px 14px;border-radius:6px;`
        + `background:#1677ff;color:#fff!important;text-decoration:none;font-weight:600;" `
        + `target="_blank" rel="noopener noreferrer">前往额度中心</a>`;
}

/** 额度不足：纯文本（供 Notification 等会转义 HTML 的组件） */
export function codeAiQuotaExhaustedMessagePlain(
    dailyLimit: unknown,
    opts?: {
        limitTiers?: Partial<CodeAiDailyLimitTiers>;
        quotaRef?: AiAnalysisQuotaRef | null;
        quotaCenterPath?: string | null;
    },
): string {
    const page = resolveQuotaCenterPage(opts?.quotaRef, opts?.quotaCenterPath);
    const ref = opts?.quotaRef;
    if (ref && isAiQuotaWalletRef(ref)) {
        const bal = ref.balancePoints != null ? String(ref.balancePoints) : '?';
        return `AI 点数不足（当前余额 ${bal} 点）。请前往额度中心 ${page} 查看。`;
    }
    const tiers = resolveCodeAiDailyLimitTiers(opts?.limitTiers);
    const lim = normalizeCodeAiDailyLimit(dailyLimit, tiers.nonVip);
    if (lim <= tiers.nonVip) {
        return `今日 AI 次数已用完（非会员每日 ${tiers.nonVip} 次）。开通会员可享每日 ${tiers.vip} 次；也可前往额度中心 ${page}。明日刷新。`;
    }
    if (lim < tiers.vip) {
        return `今日 AI 次数已用完（已购本题关联题库每日 ${lim} 次）。开通会员可享每日 ${tiers.vip} 次；也可前往额度中心 ${page}。明日刷新。`;
    }
    return `今日 AI 次数已用完（会员每日 ${tiers.vip} 次）。请前往额度中心 ${page} 查看，明日刷新。`;
}

/** 额度不足：可安全写入 innerHTML 的说明（含额度中心链接） */
export function codeAiQuotaExhaustedMessageHtml(
    dailyLimit: unknown,
    opts?: {
        limitTiers?: Partial<CodeAiDailyLimitTiers>;
        quotaRef?: AiAnalysisQuotaRef | null;
        quotaCenterPath?: string | null;
    },
): string {
    const page = resolveQuotaCenterPage(opts?.quotaRef, opts?.quotaCenterPath);
    const cta = quotaCenterCtaHtml(page);
    const ref = opts?.quotaRef;
    if (ref && isAiQuotaWalletRef(ref)) {
        const bal = escapeQuotaHtml(ref.balancePoints != null ? String(ref.balancePoints) : '?');
        const pageEsc = escapeQuotaHtml(page);
        return `AI 点数不足（当前余额 <strong>${bal}</strong> 点）。`
            + `请前往 <a href="${pageEsc}" class="ai-analysis-quota-bar__vip-link" style="display:inline;" target="_blank" rel="noopener noreferrer"><strong>额度中心</strong></a> 查看。`
            + cta;
    }
    const tiers = resolveCodeAiDailyLimitTiers(opts?.limitTiers);
    const lim = normalizeCodeAiDailyLimit(dailyLimit, tiers.nonVip);
    if (lim <= tiers.nonVip) {
        return `今日 AI 次数已用完（非会员每日 ${tiers.nonVip} 次）。`
            + `<a href="/vip" class="ai-analysis-quota-bar__vip-link" style="display:inline;"><strong>开通会员</strong></a>可享每日 ${tiers.vip} 次，明日刷新。`
            + cta;
    }
    if (lim < tiers.vip) {
        return `今日 AI 次数已用完（已购本题关联题库每日 ${lim} 次）。`
            + `<a href="/vip" class="ai-analysis-quota-bar__vip-link" style="display:inline;"><strong>开通会员</strong></a>可享每日 ${tiers.vip} 次，明日刷新。`
            + cta;
    }
    return `今日 AI 次数已用完（会员每日 ${tiers.vip} 次），明日刷新。${cta}`;
}

/** 是否为 AI 点数/日次数不足类错误文案 */
export function isAiQuotaExhaustedErrorText(msg: string): boolean {
    return /点数不足|次数已用完|AI_QUOTA_INSUFFICIENT|额度已全部用完|额度已用尽/.test(String(msg || ''));
}

/** 解析 `data: {...}\n\n` SSE 缓冲 */
export function parseRecordAiSseBuffer(buffer: string): { events: Record<string, unknown>[]; rest: string } {
    const events: Record<string, unknown>[] = [];
    const blocks = buffer.split('\n\n');
    const rest = blocks.pop() ?? '';
    for (const block of blocks) {
        for (const line of block.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            try {
                events.push(JSON.parse(trimmed.slice(6)));
            } catch {
                /* ignore */
            }
        }
    }
    return { events, rest };
}

function escapeHtml(s: string): string {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const RECORD_AI_CODE_BLOCK_STYLE_ID = 'record-ai-code-block-styles-v4';

/** 与流式挂载点 class 一致，便于样式与增强逻辑只作用于 AI 分析区 */
export const RECORD_AI_STREAM_MD_CLASS = 'record-ai-stream-md';

/**
 * 注入 AI Markdown 代码块工具条 + 与代码笔记 markdown-body 对齐的暗色正文样式（幂等）。
 */
export function ensureRecordAiMarkdownCodeBlockStyles(): void {
    if (document.getElementById(RECORD_AI_CODE_BLOCK_STYLE_ID)) return;
    document.getElementById('record-ai-code-block-styles')?.remove();
    document.getElementById('record-ai-code-block-styles-v2')?.remove();
    document.getElementById('record-ai-code-block-styles-v3')?.remove();
    const s = document.createElement('style');
    s.id = RECORD_AI_CODE_BLOCK_STYLE_ID;
    const c = RECORD_AI_STREAM_MD_CLASS;
    s.textContent = `
/* ---------- 代码块外壳 + 复制（对齐代码笔记题面代码块观感） ---------- */
.${c} .record-ai-code-block {
  margin: 20px 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.theme--dark .${c} .record-ai-code-block {
  background: #282828;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}
.${c} .record-ai-code-block__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid #e5e7eb;
  background: #fbfbfc;
  font-size: 12px;
  line-height: 1.3;
}
.theme--dark .${c} .record-ai-code-block__toolbar {
  border-bottom-color: #3a3a3a;
  background: #2d2d2d;
}
.${c} .record-ai-code-block__lang {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 6px;
  font-weight: 600;
  color: #1f2937;
  letter-spacing: 0.02em;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  font-family: 'Consolas', 'Monaco', 'Courier New', ui-monospace, monospace;
}
.theme--dark .${c} .record-ai-code-block__lang {
  color: #e5e7eb;
  border-color: #4b5563;
  background: #3a3a3a;
}
.${c} .record-ai-code-block__copy {
  flex-shrink: 0;
  margin: 0;
  padding: 4px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #111827;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  line-height: 1.2;
}
.${c} .record-ai-code-block__copy:hover {
  background: #f8fafc;
  border-color: #9ca3af;
}
.${c} .record-ai-code-block__copy:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 1px;
}
.theme--dark .${c} .record-ai-code-block__copy {
  border-color: #444c56;
  background: #373e47;
  color: #e6edf3;
}
.theme--dark .${c} .record-ai-code-block__copy:hover {
  background: #444c56;
  border-color: #636c76;
}
/* 代码区：与 codenote markdown-body.css 一致 #282828 + 浅灰字 */
.${c} .record-ai-code-block pre {
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 0 !important;
  background: #ffffff !important;
  box-shadow: none !important;
  overflow: hidden;
}
.${c} .record-ai-code-block pre code {
  display: block;
  padding: 16px !important;
  margin: 0 !important;
  font-size: 14px !important;
  line-height: 1.5 !important;
  color: #1f2937 !important;
  background: transparent !important;
  border-radius: 0 !important;
  overflow-x: auto;
  font-family: 'Consolas', 'Monaco', 'Courier New', ui-monospace, monospace !important;
  tab-size: 4;
}
.${c} .record-ai-code-block pre code::-webkit-scrollbar { height: 8px; }
.${c} .record-ai-code-block pre code::-webkit-scrollbar-track {
  background: #edf2f7;
  border-radius: 4px;
}
.${c} .record-ai-code-block pre code::-webkit-scrollbar-thumb {
  background: #94a3b8;
  border-radius: 4px;
}
.${c} .record-ai-code-block pre code::-webkit-scrollbar-thumb:hover { background: #64748b; }

/* AI 分析区禁用 Prism 自带 toolbar-item（避免与自定义复制按钮重复） */
.${c} .code-toolbar > .toolbar,
.${c} .code-toolbar .toolbar-item {
  display: none !important;
}

/* 亮色代码语法色 */
.${c} .record-ai-code-block pre code .token.comment,
.${c} .record-ai-code-block pre code .token.prolog,
.${c} .record-ai-code-block pre code .token.doctype,
.${c} .record-ai-code-block pre code .token.cdata,
.${c}.markdown-body > pre > code .token.comment,
.${c}.markdown-body > pre > code .token.prolog,
.${c}.markdown-body > pre > code .token.doctype,
.${c}.markdown-body > pre > code .token.cdata,
.${c} .markdown-body > pre > code .token.comment,
.${c} .markdown-body > pre > code .token.prolog,
.${c} .markdown-body > pre > code .token.doctype,
.${c} .markdown-body > pre > code .token.cdata {
  color: #6e7781 !important;
  font-style: italic;
}
.${c} .record-ai-code-block pre code .token.keyword,
.${c} .record-ai-code-block pre code .token.selector,
.${c} .record-ai-code-block pre code .token.atrule,
.${c}.markdown-body > pre > code .token.keyword,
.${c}.markdown-body > pre > code .token.selector,
.${c}.markdown-body > pre > code .token.atrule,
.${c} .markdown-body > pre > code .token.keyword,
.${c} .markdown-body > pre > code .token.selector,
.${c} .markdown-body > pre > code .token.atrule {
  color: #1d4ed8 !important;
}
.${c} .record-ai-code-block pre code .token.string,
.${c} .record-ai-code-block pre code .token.char,
.${c} .record-ai-code-block pre code .token.attr-value,
.${c}.markdown-body > pre > code .token.string,
.${c}.markdown-body > pre > code .token.char,
.${c}.markdown-body > pre > code .token.attr-value,
.${c} .markdown-body > pre > code .token.string,
.${c} .markdown-body > pre > code .token.char,
.${c} .markdown-body > pre > code .token.attr-value {
  color: #0f766e !important;
}
.${c} .record-ai-code-block pre code .token.function,
.${c} .record-ai-code-block pre code .token.class-name,
.${c}.markdown-body > pre > code .token.function,
.${c}.markdown-body > pre > code .token.class-name,
.${c} .markdown-body > pre > code .token.function,
.${c} .markdown-body > pre > code .token.class-name {
  color: #7c3aed !important;
}
.${c} .record-ai-code-block pre code .token.number,
.${c} .record-ai-code-block pre code .token.boolean,
.${c}.markdown-body > pre > code .token.number,
.${c}.markdown-body > pre > code .token.boolean,
.${c} .markdown-body > pre > code .token.number,
.${c} .markdown-body > pre > code .token.boolean {
  color: #b45309 !important;
}
.${c} .record-ai-code-block pre code .token.operator,
.${c} .record-ai-code-block pre code .token.punctuation,
.${c}.markdown-body > pre > code .token.operator,
.${c}.markdown-body > pre > code .token.punctuation,
.${c} .markdown-body > pre > code .token.operator,
.${c} .markdown-body > pre > code .token.punctuation {
  color: #1f2937 !important;
}

/* 流式阶段常见结构：markdown-body 直接子级 pre（与代码笔记块一致） */
.${c}.markdown-body > pre,
.${c} .markdown-body > pre {
  margin: 16px 0;
  background: #ffffff !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 8px !important;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04) !important;
}
.${c}.markdown-body > pre > code,
.${c} .markdown-body > pre > code {
  display: block;
  background: #ffffff !important;
  color: #1f2937 !important;
  padding: 16px !important;
  font-size: 14px !important;
  line-height: 1.5 !important;
}

/* ---------- 亮色：正文 ---------- */
.${c}.markdown-body,
.${c} .markdown-body {
  color: #24292f;
  font-size: 15px;
  line-height: 1.75;
  letter-spacing: 0.01em;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.${c}.markdown-body > *:first-child,
.${c} .markdown-body > *:first-child {
  margin-top: 0 !important;
}
.${c}.markdown-body > *:last-child,
.${c} .markdown-body > *:last-child {
  margin-bottom: 0 !important;
}
.${c}.markdown-body p,
.${c} .markdown-body p {
  margin: 0 0 12px;
}
.${c}.markdown-body h1,
.${c}.markdown-body h2,
.${c}.markdown-body h3,
.${c}.markdown-body h4,
.${c}.markdown-body h5,
.${c}.markdown-body h6,
.${c} .markdown-body h1,
.${c} .markdown-body h2,
.${c} .markdown-body h3,
.${c} .markdown-body h4,
.${c} .markdown-body h5,
.${c} .markdown-body h6 {
  margin-top: 22px;
  margin-bottom: 12px;
  line-height: 1.4;
  letter-spacing: 0;
}
.${c}.markdown-body h1,
.${c} .markdown-body h1 {
  font-size: 28px;
}
.${c}.markdown-body h2,
.${c} .markdown-body h2 {
  font-size: 24px;
}
.${c}.markdown-body h3,
.${c} .markdown-body h3 {
  font-size: 20px;
}
.${c}.markdown-body ul,
.${c}.markdown-body ol,
.${c} .markdown-body ul,
.${c} .markdown-body ol {
  margin-top: 8px;
  margin-bottom: 12px;
  padding-left: 1.45em;
}
.${c}.markdown-body li + li,
.${c} .markdown-body li + li {
  margin-top: 4px;
}
.${c}.markdown-body code:not(pre code),
.${c} .markdown-body code:not(pre code) {
  padding: 0.12em 0.4em;
  border-radius: 5px;
  font-size: 0.92em;
  background: #f3f4f6;
  color: #b42318;
}
.${c}.markdown-body blockquote,
.${c} .markdown-body blockquote {
  margin: 14px 0;
  padding: 8px 12px;
  color: #57606a;
  border-left: 4px solid #d0d7de;
  background: #f6f8fa;
  border-radius: 0 8px 8px 0;
}
.${c}.markdown-body hr,
.${c} .markdown-body hr {
  margin: 18px 0;
}
.${c}.markdown-body table,
.${c} .markdown-body table {
  margin: 12px 0 16px;
}
.${c}.markdown-body strong,
.${c} .markdown-body strong {
  font-weight: 700;
  color: #111827;
}
.${c}.markdown-body h1,
.${c}.markdown-body h2,
.${c}.markdown-body h3,
.${c} .markdown-body h1,
.${c} .markdown-body h2,
.${c} .markdown-body h3 {
  color: #1f2937;
}

/* ---------- 暗色主题：正文（对齐 codenote markdown-body 暗色段） ---------- */
.theme--dark .${c}.markdown-body,
.theme--dark .${c} .markdown-body {
  color: #c9d1d9;
}
.theme--dark .${c} .record-ai-code-block pre {
  background: #282828 !important;
}
.theme--dark .${c} .record-ai-code-block pre code {
  color: #e5e7eb !important;
}
.theme--dark .${c} .record-ai-code-block pre code::-webkit-scrollbar-track {
  background: #2d2d2d;
}
.theme--dark .${c} .record-ai-code-block pre code::-webkit-scrollbar-thumb {
  background: #555;
}
.theme--dark .${c} .record-ai-code-block pre code::-webkit-scrollbar-thumb:hover {
  background: #666;
}
/* 暗色代码语法色 */
.theme--dark .${c} .record-ai-code-block pre code .token.comment,
.theme--dark .${c} .record-ai-code-block pre code .token.prolog,
.theme--dark .${c} .record-ai-code-block pre code .token.doctype,
.theme--dark .${c} .record-ai-code-block pre code .token.cdata {
  color: #8b949e !important;
}
.theme--dark .${c} .record-ai-code-block pre code .token.keyword,
.theme--dark .${c} .record-ai-code-block pre code .token.selector,
.theme--dark .${c} .record-ai-code-block pre code .token.atrule {
  color: #ff7b72 !important;
}
.theme--dark .${c} .record-ai-code-block pre code .token.string,
.theme--dark .${c} .record-ai-code-block pre code .token.char,
.theme--dark .${c} .record-ai-code-block pre code .token.attr-value {
  color: #a5d6ff !important;
}
.theme--dark .${c} .record-ai-code-block pre code .token.function,
.theme--dark .${c} .record-ai-code-block pre code .token.class-name {
  color: #d2a8ff !important;
}
.theme--dark .${c} .record-ai-code-block pre code .token.number,
.theme--dark .${c} .record-ai-code-block pre code .token.boolean {
  color: #79c0ff !important;
}
.theme--dark .${c} .record-ai-code-block pre code .token.operator,
.theme--dark .${c} .record-ai-code-block pre code .token.punctuation {
  color: #e6edf3 !important;
}
.theme--dark .${c}.markdown-body > pre,
.theme--dark .${c} .markdown-body > pre {
  background: #282828 !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18) !important;
}
.theme--dark .${c}.markdown-body > pre > code,
.theme--dark .${c} .markdown-body > pre > code {
  background: #282828 !important;
  color: #e5e7eb !important;
}
.theme--dark .${c}.markdown-body code:not(pre code),
.theme--dark .${c} .markdown-body code:not(pre code) {
  background: #21262d;
  color: #ffb86b;
}
.theme--dark .${c}.markdown-body blockquote,
.theme--dark .${c} .markdown-body blockquote {
  color: #8b949e;
  border-left-color: #30363d;
  background: #161b22;
}
.theme--dark .${c}.markdown-body h1,
.theme--dark .${c}.markdown-body h2,
.theme--dark .${c}.markdown-body h3,
.theme--dark .${c}.markdown-body h4,
.theme--dark .${c}.markdown-body h5,
.theme--dark .${c}.markdown-body h6,
.theme--dark .${c} .markdown-body h1,
.theme--dark .${c} .markdown-body h2,
.theme--dark .${c} .markdown-body h3,
.theme--dark .${c} .markdown-body h4,
.theme--dark .${c} .markdown-body h5,
.theme--dark .${c} .markdown-body h6 {
  color: #c9d1d9;
}
.theme--dark .${c}.markdown-body p,
.theme--dark .${c}.markdown-body li,
.theme--dark .${c} .markdown-body p,
.theme--dark .${c} .markdown-body li {
  color: #c9d1d9;
}
.theme--dark .${c}.markdown-body a,
.theme--dark .${c} .markdown-body a {
  color: #58a6ff;
}
.theme--dark .${c}.markdown-body a:hover,
.theme--dark .${c} .markdown-body a:hover {
  color: #79b8ff;
}
.theme--dark .${c}.markdown-body code:not(pre code),
.theme--dark .${c} .markdown-body code:not(pre code) {
  background: #21262d;
  color: #ffa116;
}
.theme--dark .${c}.markdown-body blockquote,
.theme--dark .${c} .markdown-body blockquote {
  color: #8b949e;
  border-left-color: #30363d;
}
.theme--dark .${c}.markdown-body hr,
.theme--dark .${c} .markdown-body hr {
  border-top-color: #30363d;
  background-color: #30363d;
}
.theme--dark .${c}.markdown-body th,
.theme--dark .${c}.markdown-body td,
.theme--dark .${c} .markdown-body th,
.theme--dark .${c} .markdown-body td {
  border-color: #30363d;
}
.theme--dark .${c}.markdown-body th,
.theme--dark .${c} .markdown-body th {
  background: #21262d;
}
.theme--dark .${c}.markdown-body tbody,
.theme--dark .${c} .markdown-body tbody {
  background-color: #161b22;
}
.theme--dark .${c}.markdown-body strong,
.theme--dark .${c} .markdown-body strong {
  color: #e6edf3;
}

/* ---------- 流式中隐藏原始 repair JSON；结束后由 JS 替换为 Diff ---------- */
.${c} pre:has(> code.language-record-ai-repair),
.${c} pre:has(> code.language-record_ai_repair) {
  display: none !important;
}

/* ---------- Diff 卡片（GitHub 风格统一 diff） ---------- */
.${c} .record-ai-repair {
  margin: 16px 0 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.${c} .record-ai-repair__banner {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #f8fafc;
  font-size: 13px;
  line-height: 1.5;
  color: #334155;
}
.${c} .record-ai-repair__banner--correct {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}
.${c} .record-ai-repair__banner--local {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1e3a8a;
}
.${c} .record-ai-repair__banner--full {
  border-color: #fde68a;
  background: #fffbeb;
  color: #92400e;
}
.${c} .record-ai-repair__badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 22px;
  background: rgba(255,255,255,0.7);
}
.${c} .record-ai-repair__summary {
  flex: 1 1 12em;
  min-width: 0;
}
.${c} .record-ai-diff-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.${c} .record-ai-diff-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  padding: 10px 12px 6px;
  border-bottom: 1px solid #f1f5f9;
  background: #fafbfc;
}
.${c} .record-ai-diff-card__title {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  margin: 0;
}
.${c} .record-ai-diff-card__reason {
  margin: 0;
  padding: 0 12px 10px;
  font-size: 12.5px;
  line-height: 1.55;
  color: #475569;
  background: #fafbfc;
  border-bottom: 1px solid #f1f5f9;
}
.${c} .record-ai-diff-card__body {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
  background: #f6f8fa;
}
.${c} .record-ai-diff-lines {
  margin: 0;
  padding: 4px 0;
  min-width: max-content;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  tab-size: 4;
}
.${c} .record-ai-diff-line {
  display: flex;
  align-items: stretch;
  white-space: pre;
  min-height: 1.55em;
}
/* ± | 单列行号 | 代码（−/上下文用旧侧，+ 用新侧） */
.${c} .record-ai-diff-line__gutter {
  flex: 0 0 22px;
  width: 22px;
  text-align: center;
  user-select: none;
  opacity: 0.9;
}
.${c} .record-ai-diff-line__num {
  flex: 0 0 40px;
  width: 40px;
  text-align: right;
  padding: 0 8px 0 0;
  user-select: none;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
  border-right: 1px solid transparent;
  color: #656d76;
}
.${c} .record-ai-diff-line__code {
  flex: 1 1 auto;
  padding: 0 12px 0 8px;
}
.${c} .record-ai-diff-line--del {
  background: #ffebe9;
  color: #82071e;
}
.${c} .record-ai-diff-line--del .record-ai-diff-line__num,
.${c} .record-ai-diff-line--del .record-ai-diff-line__gutter {
  background: #ffcecb;
  color: #cf222e;
  border-right-color: #ffb1ad;
}
.${c} .record-ai-diff-line--add {
  background: #dafbe1;
  color: #116329;
}
.${c} .record-ai-diff-line--add .record-ai-diff-line__num,
.${c} .record-ai-diff-line--add .record-ai-diff-line__gutter {
  background: #b8f0c4;
  color: #1a7f37;
  border-right-color: #8fe09f;
}
.${c} .record-ai-diff-line--ctx {
  background: transparent;
  color: #1f2328;
}
.${c} .record-ai-diff-line--ctx .record-ai-diff-line__num,
.${c} .record-ai-diff-line--ctx .record-ai-diff-line__gutter {
  color: #8b949e;
}
.theme--dark .${c} .record-ai-repair__banner {
  border-color: #30363d;
  background: #161b22;
  color: #c9d1d9;
}
.theme--dark .${c} .record-ai-repair__banner--correct {
  border-color: #238636;
  background: #0d2818;
  color: #3fb950;
}
.theme--dark .${c} .record-ai-repair__banner--local {
  border-color: #1f6feb;
  background: #0d1b2e;
  color: #79c0ff;
}
.theme--dark .${c} .record-ai-repair__banner--full {
  border-color: #9a6700;
  background: #2a2000;
  color: #d29922;
}
.theme--dark .${c} .record-ai-repair__badge {
  background: rgba(0,0,0,0.25);
}
.theme--dark .${c} .record-ai-diff-card {
  border-color: #30363d;
  background: #0d1117;
  box-shadow: none;
}
.theme--dark .${c} .record-ai-diff-card__head,
.theme--dark .${c} .record-ai-diff-card__reason {
  background: #161b22;
  border-bottom-color: #21262d;
  color: #8b949e;
}
.theme--dark .${c} .record-ai-diff-card__title {
  color: #e6edf3;
}
.theme--dark .${c} .record-ai-diff-card__body {
  background: #0d1117;
}
.theme--dark .${c} .record-ai-diff-line--del {
  background: rgba(248, 81, 73, 0.15);
  color: #ffb1af;
}
.theme--dark .${c} .record-ai-diff-line--del .record-ai-diff-line__num,
.theme--dark .${c} .record-ai-diff-line--del .record-ai-diff-line__gutter {
  background: rgba(248, 81, 73, 0.28);
  color: #ff7b72;
  border-right-color: rgba(248, 81, 73, 0.4);
}
.theme--dark .${c} .record-ai-diff-line--add {
  background: rgba(63, 185, 80, 0.15);
  color: #aff5b4;
}
.theme--dark .${c} .record-ai-diff-line--add .record-ai-diff-line__num,
.theme--dark .${c} .record-ai-diff-line--add .record-ai-diff-line__gutter {
  background: rgba(63, 185, 80, 0.28);
  color: #3fb950;
  border-right-color: rgba(63, 185, 80, 0.4);
}
.theme--dark .${c} .record-ai-diff-line--ctx {
  color: #e6edf3;
}
.theme--dark .${c} .record-ai-diff-line--ctx .record-ai-diff-line__num,
.theme--dark .${c} .record-ai-diff-line--ctx .record-ai-diff-line__gutter {
  color: #8b949e;
}
@media (max-width: 640px) {
  .${c} .record-ai-diff-lines { font-size: 11px; }
  .${c} .record-ai-diff-line__code { padding-right: 8px; }
  .${c} .record-ai-diff-line__num { flex-basis: 32px; width: 32px; padding-right: 4px; }
}

/* ---------- 顶部可展开「提交代码」 ---------- */
.${c} .record-ai-submit-code {
  margin: 0 0 14px;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  background: linear-gradient(180deg, #fffaf5 0%, #fff7ed 100%);
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(255, 122, 0, 0.06);
}
.${c} .record-ai-submit-code[open] {
  border-color: #fdba74;
  box-shadow: 0 2px 8px rgba(255, 122, 0, 0.1);
}
.${c} .record-ai-submit-code__summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  list-style: none;
  cursor: pointer;
  user-select: none;
  color: #9a3412;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}
.${c} .record-ai-submit-code__summary::-webkit-details-marker { display: none; }
.${c} .record-ai-submit-code__summary::marker { content: ''; }
.${c} .record-ai-submit-code__chevron {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background: rgba(255, 122, 0, 0.12);
  color: #ea580c;
  font-size: 11px;
  line-height: 1;
  transition: transform 0.15s ease, background 0.15s ease;
}
.${c} .record-ai-submit-code[open] .record-ai-submit-code__chevron {
  transform: rotate(90deg);
  background: rgba(255, 122, 0, 0.2);
}
.${c} .record-ai-submit-code__label { flex: 0 1 auto; }
.${c} .record-ai-submit-code__meta {
  margin-left: auto;
  font-size: 12px;
  font-weight: 500;
  color: #c2410c;
  opacity: 0.85;
}
.${c} .record-ai-submit-code__body {
  border-top: 1px solid #ffedd5;
  background: #ffffff;
  height: min(42vh, 360px);
  min-height: 180px;
  overflow: hidden;
}
.${c} .record-ai-submit-code__monaco {
  width: 100%;
  height: 100%;
  min-height: 180px;
}
.${c} .record-ai-submit-code__fallback {
  margin: 0;
  padding: 12px 14px;
  height: 100%;
  overflow: auto;
  background: #0f172a;
  -webkit-overflow-scrolling: touch;
}
.${c} .record-ai-submit-code__fallback code {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  color: #e2e8f0;
  white-space: pre;
  tab-size: 4;
}
.theme--dark .${c} .record-ai-submit-code {
  border-color: rgba(255, 122, 0, 0.35);
  background: linear-gradient(180deg, #1c1410 0%, #161110 100%);
  box-shadow: none;
}
.theme--dark .${c} .record-ai-submit-code[open] {
  border-color: rgba(255, 122, 0, 0.5);
}
.theme--dark .${c} .record-ai-submit-code__summary {
  color: #fdba74;
}
.theme--dark .${c} .record-ai-submit-code__meta {
  color: #fb923c;
}
.theme--dark .${c} .record-ai-submit-code__body {
  border-top-color: #30363d;
  background: #0d1117;
}
`;
    document.head.appendChild(s);
}

const LANG_LABEL: Record<string, string> = {
    cpp: 'C++',
    c: 'C',
    python: 'Python',
    py: 'Python',
    java: 'Java',
    javascript: 'JavaScript',
    js: 'JavaScript',
    typescript: 'TypeScript',
    ts: 'TypeScript',
    go: 'Go',
    rust: 'Rust',
    rs: 'Rust',
    kotlin: 'Kotlin',
    swift: 'Swift',
    sql: 'SQL',
    bash: 'Bash',
    sh: 'Shell',
    shell: 'Shell',
    yaml: 'YAML',
    yml: 'YAML',
    json: 'JSON',
    html: 'HTML',
    css: 'CSS',
    xml: 'XML',
    markdown: 'Markdown',
    md: 'Markdown',
    text: 'Text',
    plaintext: 'Text',
};

function languageLabelFromCode(codeEl: HTMLElement): string {
    const cls = String(codeEl.className || '');
    const m = cls.match(/\blanguage-([a-z0-9+#-]+)\b/i);
    if (!m) return '代码';
    const key = m[1].toLowerCase();
    return LANG_LABEL[key] || key.replace(/^[a-z]/, (c) => c.toUpperCase());
}

async function copyTextToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            /* fall through */
        }
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch {
        return false;
    }
}

function highlightRecordAiCodeIfAvailable(codeEl: HTMLElement): void {
    const prism = (window as unknown as { Prism?: { highlightElement: (el: Element) => void } }).Prism;
    if (!prism?.highlightElement) return;
    if (codeEl.querySelector('.token')) return;
    try {
        prism.highlightElement(codeEl);
    } catch {
        /* ignore highlight failure */
    }
}

function isRecordAiRepairCodeEl(code: HTMLElement): boolean {
    const cls = String(code.className || '').toLowerCase();
    return cls.includes('language-record-ai-repair') || cls.includes('language-record_ai_repair');
}

function buildRecordAiDiffCard(
    hunk: RecordAiRepairHunk,
    index: number,
    submitCode?: string,
): HTMLElement {
    const card = document.createElement('div');
    card.className = 'record-ai-diff-card';

    const head = document.createElement('div');
    head.className = 'record-ai-diff-card__head';
    const title = document.createElement('h4');
    title.className = 'record-ai-diff-card__title';
    title.textContent = hunk.title?.trim() || `修改 ${index + 1}`;
    head.appendChild(title);
    card.appendChild(head);

    const reason = document.createElement('p');
    reason.className = 'record-ai-diff-card__reason';
    reason.textContent = hunk.reason || '';
    card.appendChild(reason);

    const body = document.createElement('div');
    body.className = 'record-ai-diff-card__body';
    const linesWrap = document.createElement('div');
    linesWrap.className = 'record-ai-diff-lines';
    linesWrap.setAttribute('role', 'table');
    linesWrap.setAttribute('aria-label', title.textContent || '代码 Diff');

    const lines = computeLineDiff(hunk.before, hunk.after);
    /** 对齐提交代码 / IDE：hunk 在源码中的起始行；找不到则相对 hunk 从 1 起 */
    const baseLine = submitCode
        ? (findSnippetStartLine(submitCode, hunk.before) ?? 1)
        : 1;

    for (const line of lines) {
        const row = document.createElement('div');
        row.className = `record-ai-diff-line record-ai-diff-line--${line.type}`;
        /**
         * 单列行号对齐 GitHub unified diff：
         * - 灰色上下文与绿色 + 共用「新文件」侧序号（同序列）
         * - 红色 − 用「旧文件」侧序号
         */
        const lineNo = line.type === 'del'
            ? (line.oldLine != null ? baseLine + line.oldLine - 1 : undefined)
            : (line.newLine != null ? baseLine + line.newLine - 1 : undefined);
        const gutter = document.createElement('span');
        gutter.className = 'record-ai-diff-line__gutter';
        gutter.textContent = line.type === 'del' ? '−' : line.type === 'add' ? '+' : ' ';
        const numEl = document.createElement('span');
        numEl.className = 'record-ai-diff-line__num';
        numEl.textContent = lineNo != null ? String(lineNo) : '';
        const code = document.createElement('span');
        code.className = 'record-ai-diff-line__code';
        code.textContent = line.text;
        // ± 在左，单列行号在右（对齐 IDE）
        row.appendChild(gutter);
        row.appendChild(numEl);
        row.appendChild(code);
        linesWrap.appendChild(row);
    }
    body.appendChild(linesWrap);
    card.appendChild(body);
    return card;
}

function buildRecordAiRepairRoot(
    payload: RecordAiRepairPayload,
    submitCode?: string,
): HTMLElement {
    const root = document.createElement('div');
    root.className = 'record-ai-repair';
    root.setAttribute('data-verdict', payload.verdict);

    const banner = document.createElement('div');
    const badge = document.createElement('span');
    badge.className = 'record-ai-repair__badge';
    const summary = document.createElement('div');
    summary.className = 'record-ai-repair__summary';

    if (payload.verdict === 'correct') {
        banner.className = 'record-ai-repair__banner record-ai-repair__banner--correct';
        badge.textContent = '无需修改';
        summary.textContent = payload.summary || '代码正确，无需修改';
    } else if (payload.verdict === 'local_fix') {
        banner.className = 'record-ai-repair__banner record-ai-repair__banner--local';
        badge.textContent = '局部修复';
        summary.textContent = payload.summary || '思路正确，以下为最小 Diff';
    } else {
        banner.className = 'record-ai-repair__banner record-ai-repair__banner--full';
        badge.textContent = '整体调整';
        const bits = [
            payload.summary,
            payload.reasonNotLocal,
        ].filter(Boolean);
        summary.textContent = bits.join(' — ') || '建议对照完整修正代码理解';
    }
    banner.appendChild(badge);
    banner.appendChild(summary);
    root.appendChild(banner);

    // 小改：只渲染 Diff；大改：不渲染 Diff（完整代码在正文 Markdown 代码块中）
    if (payload.verdict === 'local_fix') {
        (payload.hunks || []).forEach((h, i) => {
            root.appendChild(buildRecordAiDiffCard(h, i, submitCode));
        });
    }
    return root;
}

function replaceRepairFenceHost(code: HTMLElement, replacement: HTMLElement): void {
    const pre = code.closest('pre');
    const host = pre?.parentElement?.classList.contains('record-ai-code-block')
        ? pre.parentElement
        : pre || code;
    if (!host?.parentNode) return;
    host.parentNode.replaceChild(replacement, host);
}

/**
 * 将 ```record-ai-repair JSON 代码块升级为 Diff / 判定横幅。
 * 单个块解析失败不影响其它内容；无协议块时为 no-op（兼容旧分析结果）。
 */
export function enhanceRecordAiRepairBlocks(
    root: HTMLElement | null,
    opts?: { submitCode?: string },
): void {
    if (!root) return;
    ensureRecordAiMarkdownCodeBlockStyles();
    const submitCode = opts?.submitCode;
    const codes = root.querySelectorAll('code.language-record-ai-repair, code.language-record_ai_repair');
    codes.forEach((codeNode) => {
        try {
            const code = codeNode as HTMLElement;
            if (code.closest('.record-ai-repair')) return;
            const raw = String(code.textContent || '').trim();
            if (!raw) {
                const empty = document.createElement('div');
                empty.className = 'record-ai-repair';
                empty.hidden = true;
                replaceRepairFenceHost(code, empty);
                return;
            }
            let parsed: unknown;
            try {
                parsed = JSON.parse(raw);
            } catch {
                const note = document.createElement('div');
                note.className = 'record-ai-repair__banner record-ai-repair__banner--full';
                note.textContent = '修复协议解析失败，请以上文文字说明与完整代码为准。';
                replaceRepairFenceHost(code, note);
                return;
            }
            const payload = parseRecordAiRepairPayload(parsed);
            if (!payload) {
                const note = document.createElement('div');
                note.className = 'record-ai-repair__banner record-ai-repair__banner--full';
                note.textContent = '修复协议无效，请以上文文字说明与完整代码为准。';
                replaceRepairFenceHost(code, note);
                return;
            }
            replaceRepairFenceHost(code, buildRecordAiRepairRoot(payload, submitCode));
        } catch {
            /* 单个 Diff 失败不影响整篇分析 */
        }
    });
}

/** 分析结束态：先升级 Diff，再增强普通代码块 */
export function enhanceRecordAiAnalysisResultDom(
    root: HTMLElement | null,
    opts?: { submitCode?: string },
): void {
    if (!root) return;
    enhanceRecordAiRepairBlocks(root, opts);
    enhanceRecordAiMarkdownCodeBlocks(root);
}

/**
 * 为根节点内 Markdown 代码块加圆角深色区与「复制」按钮（流式 innerHTML 后调用）。
 */
export function enhanceRecordAiMarkdownCodeBlocks(root: HTMLElement | null): void {
    if (!root) return;
    root.querySelectorAll('.code-toolbar .toolbar-item').forEach((el) => el.remove());
    root.querySelectorAll('.code-toolbar .toolbar').forEach((el) => {
        if (!el.children.length) el.remove();
    });
    const pres = root.querySelectorAll('pre');
    for (let i = 0; i < pres.length; i++) {
        const pre = pres[i] as HTMLPreElement;
        if (
            pre.closest('.record-ai-code-block')
            || pre.closest('.code-toolbar')
            || pre.closest('.record-ai-repair')
            || pre.closest('.record-ai-submit-code')
        ) continue;
        const first = pre.firstElementChild;
        if (!first || first.tagName !== 'CODE') continue;
        const code = first as HTMLElement;
        if (isRecordAiRepairCodeEl(code)) continue;
        highlightRecordAiCodeIfAvailable(code);
        const parent = pre.parentNode;
        if (!parent) continue;

        const wrap = document.createElement('div');
        wrap.className = 'record-ai-code-block';

        const toolbar = document.createElement('div');
        toolbar.className = 'record-ai-code-block__toolbar';

        const langEl = document.createElement('span');
        langEl.className = 'record-ai-code-block__lang';
        langEl.textContent = languageLabelFromCode(code);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'record-ai-code-block__copy';
        btn.textContent = '复制';
        btn.setAttribute('aria-label', '复制代码');

        btn.addEventListener('click', () => {
            const raw = code.textContent ?? '';
            void (async () => {
                const ok = await copyTextToClipboard(raw);
                const prev = btn.textContent;
                btn.textContent = ok ? '已复制' : '复制失败';
                setTimeout(() => {
                    btn.textContent = prev;
                }, ok ? 1600 : 2200);
            })();
        });

        toolbar.appendChild(langEl);
        toolbar.appendChild(btn);
        wrap.appendChild(toolbar);
        parent.insertBefore(wrap, pre);
        wrap.appendChild(pre);
    }
}

/** FishOJ：题面 IDE 已加载 github-markdown；此处仅注入 AI 代码块样式 */
export function ensureGithubMarkdownForRecordAi(): void {
    ensureRecordAiMarkdownCodeBlockStyles();
}

/** 统一返回形状，便于调用方收窄字段 */
export type RecordAiStreamResult = {
    ok: boolean;
    contentHtml?: string;
    /** 空字符串表示用户中止（Abort），非空为错误信息 */
    error?: string;
    aiQuota?: AiAnalysisQuotaRef | null;
};

export type RecordAiStreamRequestOptions = {
    signal?: AbortSignal;
    apiKey?: string;
    provider?: 'deepseek' | 'kimi' | 'zhipu' | 'tongyi-qianwen' | 'doubao';
    model?: string;
    promptTemplate?: string;
    promptVars?: RecordAiPromptVars;
    /** 当前 IDE 编辑器代码：无明确提交思路时作为模版 */
    ideCode?: string;
    /** 本条提交代码：展示在分析顶部的可展开区块 */
    submitCode?: string;
    /** 提交语言（Hydro lang key 或简写） */
    submitLanguage?: string;
    disableCache?: boolean;
    autoScroll?: boolean;
    streamUrl?: string;
    cacheUrl?: string;
};

/** 自 liveEl 向上查找实际负责滚动的面板（如 .record-ai-stream-panel） */
function findStreamScrollParent(el: HTMLElement): HTMLElement | null {
    let p: HTMLElement | null = el.parentElement;
    while (p && p !== document.documentElement) {
        const st = window.getComputedStyle(p);
        const oy = st.overflowY;
        /** 不要求当前已溢出：短内容时也要挂到面板，否则增高后滚动条会跳 */
        if (oy === 'auto' || oy === 'scroll') {
            return p;
        }
        p = p.parentElement;
    }
    return null;
}

/**
 * 流式阶段更新 HTML：写入 `mount`（一般为内层 .record-ai-stream-html-root），避免反复清空整块 live 外层；并稳定滚动条。
 */
function patchLiveHtmlDuringStream(mount: HTMLElement, html: string, autoScroll = true): void {
    if (!autoScroll) {
        mount.innerHTML = html;
        return;
    }
    const sp = findStreamScrollParent(mount);
    const prevTop = sp ? sp.scrollTop : 0;
    const prevSh = sp ? sp.scrollHeight : 0;
    const prevCh = sp ? sp.clientHeight : 0;
    const nearBottom = sp ? prevSh - prevTop - prevCh < 56 : true;

    mount.innerHTML = html;

    if (!sp) return;
    const nextSh = sp.scrollHeight;
    if (nearBottom) {
        sp.scrollTop = nextSh;
    } else {
        sp.scrollTop = prevTop + (nextSh - prevSh);
    }
}

/**
 * 将流式 HTML 写入 liveEl；成功时 liveEl 外层可再包一层 markdown-body。
 */
export async function runRecordAiAnalysisStream(
    rid: string,
    liveEl: HTMLElement,
    options?: RecordAiStreamRequestOptions,
): Promise<RecordAiStreamResult> {
    liveEl.className = `markdown-body reviewmodal__ai-live ${RECORD_AI_STREAM_MD_CLASS}`;
    liveEl.style.cssText = 'min-height:4em;line-height:1.55;';
    ensureRecordAiMarkdownCodeBlockStyles();
    /** 请求刚发出但 SSE 还未回任何正文时，先给出占位提示 */
    liveEl.innerHTML = '<p style="color:#8c8c8c;">AI思考中，请稍候</p>';

    try {
        const streamUrl = options?.streamUrl || RECORD_AI_ANALYSIS_STREAM_URL;
        const streamRes = await fetch(streamUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'text/event-stream',
            },
            body: JSON.stringify({
                rid,
                apiKey: options?.apiKey,
                provider: options?.provider,
                model: options?.model,
                // promptTemplate 保留字段兼容，服务端已改为自行拼装材料
                promptTemplate: options?.promptTemplate,
                ideCode: options?.ideCode,
                disableCache: options?.disableCache,
                requestId: `ide-${rid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            }),
            signal: options?.signal,
        });

        const ct = streamRes.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            const res = (await streamRes.json()) as {
                error?: string;
                quotaCenterPath?: string;
                aiQuotaInsufficient?: boolean;
                code?: string;
            };
            const err = res.error || '请求失败';
            if (
                res.aiQuotaInsufficient
                || res.code === 'QUOTA_EXCEEDED'
                || isAiQuotaExhaustedErrorText(err)
            ) {
                liveEl.innerHTML = `<div style="color:#cf1322;text-align:center;padding:12px;line-height:1.7;">${
                    codeAiQuotaExhaustedMessageHtml(null, {
                        quotaCenterPath: res.quotaCenterPath || '/ai-quota',
                        quotaRef: {
                            source: 'ai_quota',
                            limited: true,
                            remaining: 0,
                            dailyLimit: null,
                            canUsePaidAnalysis: false,
                            quotaPageUrl: res.quotaCenterPath || '/ai-quota',
                        },
                    })
                }</div>`;
            } else {
                liveEl.innerHTML = `<p style="color:#f5222d;">${escapeHtml(err)}</p>`;
            }
            return { ok: false, error: err, aiQuota: null };
        }
        if (!streamRes.ok || !streamRes.body) {
            const err = streamRes.statusText || '请求失败';
            liveEl.innerHTML = `<p style="color:#f5222d;">${escapeHtml(err)}</p>`;
            return { ok: false, error: err, aiQuota: null };
        }

        /** 流式正文只写内层 mount；提交代码折叠条挂在外层，避免被流式 patch 冲掉 */
        liveEl.innerHTML = '';
        mountRecordAiSubmitCodeCollapse(liveEl, options?.submitCode, { language: options?.submitLanguage });
        const streamMount = document.createElement('div');
        streamMount.className = 'record-ai-stream-html-root';
        streamMount.innerHTML = '<p style="color:#8c8c8c;">AI思考中，请稍候</p>';
        liveEl.appendChild(streamMount);

        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let donePayload: Record<string, any> | null = null;
        let streamError: string | null = null;
        let hasNonEmptyStreamHtml = false;

        /** 首帧立刻刷；之后 85ms trailing debounce，合并高频 SSE */
        let pendingStreamHtml: string | null = null;
        let streamDebounceT: ReturnType<typeof setTimeout> | null = null;
        let streamFirstFlush = true;

        const flushStreamHtmlNow = () => {
            if (streamDebounceT !== null) {
                clearTimeout(streamDebounceT);
                streamDebounceT = null;
            }
            if (pendingStreamHtml === null) return;
            const h = pendingStreamHtml;
            pendingStreamHtml = null;
            patchLiveHtmlDuringStream(streamMount, h, options?.autoScroll !== false);
        };

        const queueStreamHtmlPaint = (html: string) => {
            pendingStreamHtml = html;
            if (streamFirstFlush) {
                streamFirstFlush = false;
                flushStreamHtmlNow();
                return;
            }
            if (streamDebounceT !== null) {
                clearTimeout(streamDebounceT);
            }
            streamDebounceT = setTimeout(flushStreamHtmlNow, 85);
        };

        const cancelAndFlushStreamPaint = () => {
            if (streamDebounceT !== null) {
                clearTimeout(streamDebounceT);
                streamDebounceT = null;
            }
            if (pendingStreamHtml !== null) {
                patchLiveHtmlDuringStream(streamMount, pendingStreamHtml, options?.autoScroll !== false);
                pendingStreamHtml = null;
            }
        };

        const applyEvents = (events: Record<string, unknown>[]) => {
            let lastStreamHtml: string | undefined;
            for (const ev of events) {
                const e = ev as Record<string, any>;
                if (e.type === 'html' && typeof e.html === 'string') {
                    const currentHtml = String(e.html);
                    const hasVisible = currentHtml.replace(/<[^>]*>/g, '').trim().length > 0;
                    if (!hasVisible && !hasNonEmptyStreamHtml) {
                        continue;
                    }
                    if (hasVisible) hasNonEmptyStreamHtml = true;
                    /** 同一 TCP 包里可能有多段 SSE，只刷最后一帧 html，减少重排与闪动 */
                    lastStreamHtml = currentHtml;
                } else if (e.type === 'done') {
                    donePayload = e;
                } else if (e.type === 'error') {
                    streamError = String(e.error || '分析失败');
                }
            }
            if (lastStreamHtml !== undefined) {
                /** 流式过程中不 enhance 代码块 */
                queueStreamHtmlPaint(lastStreamHtml);
            }
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const { events, rest } = parseRecordAiSseBuffer(buf);
            buf = rest;
            applyEvents(events);
        }
        applyEvents(parseRecordAiSseBuffer(`${buf}\n\n`).events);

        cancelAndFlushStreamPaint();

        if (streamError) {
            liveEl.innerHTML = `<p style="color:#f5222d;">${escapeHtml(streamError)}</p>`;
            return { ok: false, error: streamError, aiQuota: null };
        }
        if (donePayload?.contentHtml && typeof donePayload.contentHtml === 'string') {
            const scrollParent = findStreamScrollParent(liveEl);
            const prevTop = scrollParent?.scrollTop ?? 0;
            /** 保留流式阶段用户已展开的「提交代码」，避免 done 时重建导致折叠 */
            type SubmitCodeDetails = HTMLDetailsElement & {
                __submitMonaco?: SubmitCodeMonacoEditor | null;
            };
            const existingSubmitCode = liveEl.querySelector('.record-ai-submit-code') as SubmitCodeDetails | null;
            Array.from(liveEl.children).forEach((child) => {
                if (child !== existingSubmitCode) child.remove();
            });
            if (!existingSubmitCode) {
                mountRecordAiSubmitCodeCollapse(liveEl, options?.submitCode, {
                    language: options?.submitLanguage,
                });
            } else if (existingSubmitCode !== liveEl.firstChild) {
                liveEl.insertBefore(existingSubmitCode, liveEl.firstChild);
            }
            const bodyWrap = document.createElement('div');
            bodyWrap.className = 'markdown-body';
            bodyWrap.innerHTML = donePayload.contentHtml;
            liveEl.appendChild(bodyWrap);
            enhanceRecordAiAnalysisResultDom(liveEl, { submitCode: options?.submitCode });
            if (existingSubmitCode?.open) {
                try {
                    existingSubmitCode.__submitMonaco?.layout();
                } catch {
                    /* ignore */
                }
            }
            if (scrollParent && options?.autoScroll !== false) {
                scrollParent.scrollTop = prevTop;
            }
            return {
                ok: true,
                contentHtml: donePayload.contentHtml as string,
                aiQuota: (donePayload.aiQuota as AiAnalysisQuotaRef) || null,
            };
        }
        liveEl.innerHTML = '<p style="color:#f5222d;">分析未完成，请重试</p>';
        return { ok: false, error: '分析未完成，请重试', aiQuota: null };
    } catch (e: unknown) {
        const name = e && typeof e === 'object' && 'name' in e ? String((e as Error).name) : '';
        if (name === 'AbortError') {
            return { ok: false, error: '', aiQuota: null };
        }
        const msg = e instanceof Error ? e.message : String(e);
        liveEl.innerHTML = `<p style="color:#f5222d;">${escapeHtml(msg)}</p>`;
        return { ok: false, error: msg, aiQuota: null };
    }
}
