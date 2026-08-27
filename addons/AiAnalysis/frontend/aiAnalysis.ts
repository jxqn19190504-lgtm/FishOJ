import { Notification, request } from '@hydrooj/ui-default';
import { formatRecordStatusLabelZh, formatRecordJudgeResultPromptText } from '../lib/judgeResultPrompt';
import {
    DEFAULT_AI_MODEL,
    AI_MODEL_PRESETS,
    defaultProblemIdeAiPromptTemplate,
    readProblemIdeAiSettings,
    writeProblemIdeAiSettings,
    recordAiStreamRequestOptionsFromSavedSettings,
    type ProblemIdeAiSettings,
} from '../lib/settings';
import {
    RECORD_AI_PAUSE_OR_LEAVE_NON_REFUND_HINT_ZH,
    RECORD_AI_STREAM_MD_CLASS,
    RECORD_AI_ANALYSIS_QUOTA_URL,
    ensureGithubMarkdownForRecordAi,
    fetchRecordAiAnalysisCache,
    parseAiAnalysisQuotaRef,
    renderRecordAiCachedAnalysisIntoStreamRoot,
    runRecordAiAnalysisStream,
    type AiAnalysisQuotaRef,
} from '../lib/streamClient';

declare const UiContext: {
    aiAnalysis?: {
        enabled?: boolean;
        streamUrl?: string;
        cacheUrl?: string;
        quotaUrl?: string;
        canUseCustomApiKey?: boolean;
        quota?: AiAnalysisQuotaRef;
    };
    ideShortCooldown?: boolean;
    problemId?: string;
    problemNumId?: number;
    pdoc?: { content?: unknown; textSol?: unknown };
    getRecordDetailUrl?: string;
};

declare global {
    interface Window {
        FishOJProblemIde?: {
            getSnapshot: () => { language: string; code: string };
        };
        __problemIdeLangRange?: Record<string, string>;
    }
}

const AI_ANALYSIS_OPEN = 'problem-ide-ai-analysis-open';

function normalizeRecordId(raw: unknown): string {
    if (raw == null) return '';
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'object' && raw !== null && typeof (raw as { toString?: () => string }).toString === 'function') {
        const s = (raw as { toString: () => string }).toString();
        if (/^[a-f0-9]{24}$/i.test(s)) return s;
    }
    return String(raw).trim();
}

function recordStatusNum(rdoc: any): number {
    const st = rdoc?.status;
    if (typeof st === 'number' && Number.isFinite(st)) return st;
    return parseInt(String(st ?? ''), 10);
}

function escapeHtml(s: string): string {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showProblemTab(type: string) {
    const left = document.querySelector('.problem-ide-left');
    if (!left) return;
    left.querySelectorAll('.section__tab-header-item').forEach((el) => el.classList.remove('tab--active'));
    left.querySelector(`.section__tab-header-item[data-type="${type}"]`)?.classList.add('tab--active');
    left.querySelectorAll('.problem_content').forEach((el) => {
        (el as HTMLElement).style.display = 'none';
    });
    const panel = document.getElementById(`content-${type}`);
    if (panel) panel.style.display = '';
    try {
        window.dispatchEvent(new CustomEvent('problem-ide:tab-changed', { detail: { type } }));
    } catch { /* ignore */ }
}

function getRecordDetailUrl(rid: string): string {
    const id = normalizeRecordId(rid);
    return UiContext.getRecordDetailUrl?.replace('%7Brid%7D', id).replace('{rid}', id) || `/record/${id}`;
}

function showEmptyAiPanel(metaEl: HTMLElement | null, streamRoot: HTMLElement | null) {
    if (metaEl) {
        metaEl.innerHTML = '<span class="problem-ide-ai-panel__meta-empty">请从「运行结果」或「历史提交」选择一条记录，再点「开始AI分析」</span>';
    }
    if (streamRoot) {
        streamRoot.classList.add('record-ai-stream-panel--await-start');
        streamRoot.classList.remove('is-result', 'is-loading');
        streamRoot.innerHTML = '<div class="record-ai-await-start"><span>选择提交后开始分析</span></div>';
    }
}

const DONE = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

export function initAiAnalysis() {
    const cfg = UiContext.aiAnalysis;
    if (!cfg?.enabled) return;
    if (document.getElementById('content-aiAnalysis') == null) return;

    ensureGithubMarkdownForRecordAi();

    const pid = String(UiContext.problemId || UiContext.problemNumId || '');
    const langRange = window.__problemIdeLangRange || {};
    const canUseCustomApiKey = Boolean(cfg.canUseCustomApiKey || UiContext.ideShortCooldown);
    let quotaRef: AiAnalysisQuotaRef | null = parseAiAnalysisQuotaRef(cfg.quota) || (
        cfg.quota ? { ...cfg.quota } as AiAnalysisQuotaRef : null
    );

    const aiMetaEl = document.getElementById('problemIdeAiSubmitMeta');
    const aiSettingsToggleBtn = document.getElementById('problemIdeAiSettingsToggle') as HTMLButtonElement | null;
    const aiSettingsModalEl = document.getElementById('problemIdeAiSettingsModal');
    const aiSettingsSaveBtn = document.getElementById('problemIdeAiSettingsSave') as HTMLButtonElement | null;
    const aiSettingsCancelBtn = document.getElementById('problemIdeAiSettingsCancel') as HTMLButtonElement | null;
    const aiApiKeyInput = document.getElementById('problemIdeAiApiKey') as HTMLInputElement | null;
    const aiApiKeyHint = document.getElementById('problemIdeAiApiKeyHint');
    const aiModelHint = document.getElementById('problemIdeAiModelHint');
    const aiModelPresetSelect = document.getElementById('problemIdeAiModelPreset') as HTMLSelectElement | null;
    const aiCustomModelInput = document.getElementById('problemIdeAiCustomModel') as HTMLInputElement | null;
    const aiPromptTemplateInput = document.getElementById('problemIdeAiPromptTemplate') as HTMLTextAreaElement | null;
    const aiStartBtn = document.getElementById('problemIdeAiStartBtn') as HTMLButtonElement | null;
    const aiStreamRoot = document.getElementById('problemIdeAiStreamRoot');
    const submitResultAiBtn = document.getElementById('problemIdeSubmitResultAiBtn') as HTMLButtonElement | null;
    if (aiStreamRoot) aiStreamRoot.id = 'recordAiStreamRoot';

    const DEFAULT_AI_PROMPT_TEMPLATE = defaultProblemIdeAiPromptTemplate();

    const applySettingsToForm = async () => {
        const s = await readProblemIdeAiSettings(canUseCustomApiKey, pid);
        if (aiApiKeyInput) {
            aiApiKeyInput.value = s.apiKey;
            aiApiKeyInput.disabled = !canUseCustomApiKey;
            if (!canUseCustomApiKey) aiApiKeyInput.placeholder = '仅会员和管理员可填写';
        }
        if (aiModelPresetSelect) {
            aiModelPresetSelect.value = s.modelPreset;
            aiModelPresetSelect.disabled = !canUseCustomApiKey;
        }
        if (aiCustomModelInput) {
            aiCustomModelInput.value = s.customModel;
            aiCustomModelInput.disabled = !canUseCustomApiKey;
        }
        if (aiPromptTemplateInput) aiPromptTemplateInput.value = s.promptTemplate;
        if (aiApiKeyHint && !canUseCustomApiKey) {
            aiApiKeyHint.textContent = '普通用户请留空使用官方 API Key（每天有次数限制）';
        }
        if (aiModelHint) {
            aiModelHint.textContent = canUseCustomApiKey
                ? '可先选择供应商；模型名称可选填'
                : '普通用户不可设置模型，默认使用 DeepSeek';
        }
    };
    void applySettingsToForm();

    const renderQuotaBar = () => {
        const barEl = document.getElementById('aiAnalysisQuotaBar');
        if (!barEl) return;
        if (!quotaRef?.limited || quotaRef.unlimited) {
            if (quotaRef?.unlimited) {
                barEl.hidden = false;
                barEl.innerHTML = '<div class="ai-analysis-quota-bar__inner">今日 AI：不限</div>';
            } else {
                barEl.hidden = true;
            }
            return;
        }
        barEl.hidden = false;
        barEl.innerHTML = `<div class="ai-analysis-quota-bar__inner">今日 AI：<span class="ai-analysis-quota-bar__num">${quotaRef.remaining}</span> / ${quotaRef.dailyLimit} 次，明日刷新</div>`;
    };
    renderQuotaBar();

    const refreshQuota = async () => {
        try {
            const url = cfg.quotaUrl || RECORD_AI_ANALYSIS_QUOTA_URL;
            const res = await request.get(url) as AiAnalysisQuotaRef;
            const parsed = parseAiAnalysisQuotaRef(res) || res;
            if (parsed) quotaRef = parsed as AiAnalysisQuotaRef;
            renderQuotaBar();
        } catch { /* ignore */ }
    };

    const closeModal = () => aiSettingsModalEl?.classList.add('problem-ide-ai-modal--hidden');
    const openModal = () => {
        void applySettingsToForm().then(() => {
            aiSettingsModalEl?.classList.remove('problem-ide-ai-modal--hidden');
        });
    };
    aiSettingsToggleBtn?.addEventListener('click', openModal);
    aiSettingsCancelBtn?.addEventListener('click', closeModal);
    aiSettingsModalEl?.addEventListener('click', (ev) => {
        if ((ev.target as HTMLElement)?.dataset?.role === 'close') closeModal();
    });
    aiSettingsSaveBtn?.addEventListener('click', async () => {
        const selectedPreset = canUseCustomApiKey
            ? (aiModelPresetSelect?.value || DEFAULT_AI_MODEL)
            : DEFAULT_AI_MODEL;
        const settings: ProblemIdeAiSettings = {
            apiKey: canUseCustomApiKey ? (aiApiKeyInput?.value || '') : '',
            promptTemplate: aiPromptTemplateInput?.value || DEFAULT_AI_PROMPT_TEMPLATE,
            modelPreset: AI_MODEL_PRESETS.has(selectedPreset) ? selectedPreset : DEFAULT_AI_MODEL,
            customModel: canUseCustomApiKey ? (aiCustomModelInput?.value || '') : '',
        };
        await writeProblemIdeAiSettings(settings, canUseCustomApiKey);
        closeModal();
        Notification.success('AI 设置已保存');
    });

    let aiCurrentTarget: { rid: string; rdoc: any; code: string } | null = null;
    let lastSubmitRid: string | null = null;
    let lastSubmitRdoc: any = null;
    let aiIsStreaming = false;
    let aiStreamAbort: AbortController | null = null;
    let aiEverCompleted = false;
    let sessionGen = 0;

    window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
        if (!aiIsStreaming) return;
        e.preventDefault();
        e.returnValue = RECORD_AI_PAUSE_OR_LEAVE_NON_REFUND_HINT_ZH;
    });

    const syncStartBtn = () => {
        if (!aiStartBtn) return;
        aiStartBtn.classList.remove('problem-ide-ai-panel__start-btn--abort');
        if (!aiCurrentTarget) {
            aiStartBtn.disabled = true;
            aiStartBtn.textContent = '开始AI分析';
            return;
        }
        aiStartBtn.disabled = false;
        aiStartBtn.textContent = aiEverCompleted ? '重新AI分析' : '开始AI分析';
    };

    const renderMeta = (rdoc: any, rid: string) => {
        if (!aiMetaEl) return;
        const lang = langRange[rdoc.lang] || rdoc.lang || '-';
        const timeCost = rdoc.time != null ? `${rdoc.time}ms` : '-';
        const mem = rdoc.memory != null ? `${(Number(rdoc.memory) / 1024).toFixed(1)}MB` : '-';
        const judgeAt = rdoc.judgeAt ? new Date(rdoc.judgeAt).toLocaleString('zh-CN') : '-';
        aiMetaEl.innerHTML = [
            `<span class="problem-ide-ai-panel__meta-item">状态: ${escapeHtml(formatRecordStatusLabelZh(rdoc.status))}</span>`,
            `<span class="problem-ide-ai-panel__meta-item">分数: ${escapeHtml(String(rdoc.score ?? '-'))}</span>`,
            `<span class="problem-ide-ai-panel__meta-item">耗时: ${escapeHtml(timeCost)}</span>`,
            `<span class="problem-ide-ai-panel__meta-item">内存: ${escapeHtml(mem)}</span>`,
            `<span class="problem-ide-ai-panel__meta-item">语言: ${escapeHtml(String(lang))}</span>`,
            `<span class="problem-ide-ai-panel__meta-item">提交时间: ${escapeHtml(judgeAt)}</span>`,
            `<span class="problem-ide-ai-panel__meta-item">记录ID: ${escapeHtml(rid)}</span>`,
        ].join('');
    };

    const openAIAnalysis = async (ridRaw: string, rdoc: any) => {
        if (!aiStartBtn || !aiStreamRoot) return;
        const rid = normalizeRecordId(ridRaw || rdoc?._id);
        if (!rid) {
            Notification.error('无法识别提交记录，请从历史提交重试');
            return;
        }
        document
            .querySelector('#problemIdeProblemTabs .section__tab-header-item[data-type="aiAnalysis"]')
            ?.removeAttribute('hidden');
        showProblemTab('aiAnalysis');
        sessionGen += 1;
        aiStartBtn.disabled = true;
        aiStartBtn.textContent = '加载中...';
        aiStreamAbort?.abort();
        aiIsStreaming = false;
        aiCurrentTarget = null;
        aiEverCompleted = false;
        aiStreamRoot.classList.remove('is-result', 'is-loading');
        aiStreamRoot.classList.add('record-ai-stream-panel--await-start');
        aiStreamRoot.innerHTML = '<div class="record-ai-await-start"><span>正在读取提交代码...</span></div>';
        renderMeta(rdoc, rid);
        renderQuotaBar();
        try {
            const detail = await request.get(getRecordDetailUrl(rid)) as any;
            const codeText = String(detail?.rdoc?.code || rdoc?.code || '');
            aiCurrentTarget = { rid, rdoc: detail?.rdoc || rdoc, code: codeText };
            syncStartBtn();
            aiStreamRoot.innerHTML = '<div class="record-ai-await-start"><span>已选中提交记录，请点击上方「开始AI分析」</span></div>';
        } catch (e) {
            aiStartBtn.disabled = true;
            aiStartBtn.textContent = '开始AI分析';
            aiStreamRoot.innerHTML = `<p class="loading-text" style="color:#f5222d;text-align:center;padding:16px;">读取提交代码失败：${escapeHtml(e instanceof Error ? e.message : String(e))}</p>`;
        }
    };

    aiStartBtn?.addEventListener('click', async () => {
        if (!aiCurrentTarget || !aiStreamRoot || !aiStartBtn) return;
        if (aiIsStreaming) {
            if (!window.confirm(`${RECORD_AI_PAUSE_OR_LEAVE_NON_REFUND_HINT_ZH}\n\n确定暂停？`)) return;
            aiStreamAbort?.abort();
            return;
        }
        const settings = await readProblemIdeAiSettings(canUseCustomApiKey, pid);
        const hasCustom = Boolean((settings.apiKey || '').trim());
        if (!hasCustom && quotaRef?.limited && !quotaRef.unlimited && quotaRef.remaining <= 0) {
            Notification.error(`今日 AI 次数已用完（每日 ${quotaRef.dailyLimit} 次），明日刷新。`);
            return;
        }
        const cacheUrl = cfg.cacheUrl;
        if (!aiEverCompleted && cacheUrl) {
            const cached = await fetchRecordAiAnalysisCache(aiCurrentTarget.rid, cacheUrl);
            if (cached.hasCache && cached.contentHtml?.trim()) {
                aiStreamRoot.classList.remove('record-ai-stream-panel--await-start', 'is-loading');
                aiStreamRoot.classList.add('is-result');
                renderRecordAiCachedAnalysisIntoStreamRoot(aiStreamRoot, cached.contentHtml, {
                    submitCode: aiCurrentTarget.code,
                    language: aiCurrentTarget.rdoc?.lang,
                });
                aiEverCompleted = true;
                syncStartBtn();
                return;
            }
        }
        aiStartBtn.textContent = '暂停';
        aiStartBtn.title = `点击暂停。${RECORD_AI_PAUSE_OR_LEAVE_NON_REFUND_HINT_ZH}`;
        aiStartBtn.classList.add('problem-ide-ai-panel__start-btn--abort');
        aiIsStreaming = true;
        const gen = sessionGen;
        aiStreamRoot.classList.remove('record-ai-stream-panel--await-start');
        aiStreamRoot.classList.add('is-result');
        const liveId = 'recordAiStreamLive';
        aiStreamRoot.innerHTML = `<div id="${liveId}" class="markdown-body reviewmodal__ai-live ${RECORD_AI_STREAM_MD_CLASS}" style="min-height:4em;line-height:1.55;"></div>`;
        const liveEl = aiStreamRoot.querySelector(`#${liveId}`) as HTMLElement | null;
        if (!liveEl) {
            aiIsStreaming = false;
            syncStartBtn();
            return;
        }
        const snap = window.FishOJProblemIde?.getSnapshot?.();
        aiStreamAbort = new AbortController();
        const outcome = await runRecordAiAnalysisStream(aiCurrentTarget.rid, liveEl, {
            signal: aiStreamAbort.signal,
            streamUrl: cfg.streamUrl,
            cacheUrl: cfg.cacheUrl,
            ...recordAiStreamRequestOptionsFromSavedSettings(settings, canUseCustomApiKey),
            ideCode: snap?.code,
            submitCode: aiCurrentTarget.code,
            submitLanguage: aiCurrentTarget.rdoc?.lang || snap?.language,
            promptVars: {
                problem_content: typeof UiContext.pdoc?.content === 'string'
                    ? UiContext.pdoc.content
                    : '',
                submit_code: aiCurrentTarget.code,
                judge_result: formatRecordJudgeResultPromptText(aiCurrentTarget.rdoc, {
                    langLabel: langRange[aiCurrentTarget.rdoc?.lang] || aiCurrentTarget.rdoc?.lang || '-',
                }),
            },
            disableCache: true,
            autoScroll: false,
        });
        aiStreamAbort = null;
        aiIsStreaming = false;
        if (gen !== sessionGen) return;
        aiStartBtn.removeAttribute('title');
        aiStartBtn.classList.remove('problem-ide-ai-panel__start-btn--abort');
        if (outcome.ok) {
            aiEverCompleted = true;
            if (outcome.aiQuota) {
                quotaRef = parseAiAnalysisQuotaRef(outcome.aiQuota) || outcome.aiQuota;
                renderQuotaBar();
            } else {
                void refreshQuota();
            }
            syncStartBtn();
            return;
        }
        if (!outcome.error) {
            syncStartBtn();
            void refreshQuota();
            return;
        }
        if (quotaRef?.limited && /次数已用完|QUOTA/.test(outcome.error)) {
            quotaRef = { ...quotaRef, remaining: 0 };
            renderQuotaBar();
        }
        aiStreamRoot.innerHTML = `<p class="loading-text" style="color:#f5222d;text-align:center;padding:16px;">${escapeHtml(outcome.error)}</p>`;
        syncStartBtn();
    });

    /** URL ?tab=aiAnalysis&rid= */
    const bootFromUrl = () => {
        const usp = new URLSearchParams(window.location.search);
        if (usp.get('tab') !== 'aiAnalysis') return;
        const rid = String(usp.get('rid') || '').trim();
        if (!rid) return;
        usp.delete('tab');
        usp.delete('rid');
        const q = usp.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
        void (async () => {
            try {
                const detail = await request.get(getRecordDetailUrl(rid)) as any;
                if (detail?.rdoc) await openAIAnalysis(rid, detail.rdoc);
            } catch { /* ignore */ }
        })();
    };
    bootFromUrl();

    document.addEventListener(AI_ANALYSIS_OPEN, ((ev: Event) => {
        const d = (ev as CustomEvent<{ rid?: string; rdoc?: any }>).detail || {};
        const rid = normalizeRecordId(d.rid || d.rdoc?._id);
        if (!rid) return;
        void openAIAnalysis(rid, d.rdoc || { _id: rid });
    }) as EventListener);

    document.addEventListener('problem-ide-submit-result', ((ev: Event) => {
        const d = (ev as CustomEvent<{ rid?: string; status?: string; rdoc?: any }>).detail || {};
        const rid = normalizeRecordId(d.rid || d.rdoc?._id);
        if (!rid || !submitResultAiBtn) return;
        const st = recordStatusNum(d.rdoc || {});
        if (st === 1) {
            submitResultAiBtn.hidden = true;
            return;
        }
        lastSubmitRid = rid;
        lastSubmitRdoc = d.rdoc || { _id: rid, status: d.status };
        submitResultAiBtn.hidden = false;
        submitResultAiBtn.onclick = () => {
            void openAIAnalysis(rid, lastSubmitRdoc || { _id: rid });
        };
    }) as EventListener);

    window.addEventListener('problem-ide:tab-changed', ((ev: Event) => {
        const type = (ev as CustomEvent<{ type?: string }>).detail?.type;
        if (type !== 'aiAnalysis') return;
        if (aiCurrentTarget) return;
        showEmptyAiPanel(aiMetaEl, aiStreamRoot);
        syncStartBtn();
    }) as EventListener);

    showEmptyAiPanel(aiMetaEl, aiStreamRoot);
    syncStartBtn();

    // exam mode：隐藏 AI tab
    const syncExam = () => {
        const root = document.getElementById('problemIdeRoot');
        const exam = root?.classList.contains('problem-ide-root--exam');
        const tab = document.querySelector('#problemIdeProblemTabs .section__tab-header-item[data-type="aiAnalysis"]') as HTMLElement | null;
        if (tab && exam) tab.hidden = true;
        else if (tab && !exam && cfg.enabled) tab.hidden = false;
    };
    syncExam();
    const rootEl = document.getElementById('problemIdeRoot');
    if (rootEl) {
        new MutationObserver(syncExam).observe(rootEl, { attributes: true, attributeFilter: ['class'] });
    }

    void DONE;
}
