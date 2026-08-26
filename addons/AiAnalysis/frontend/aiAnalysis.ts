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
    parseAiAnalysisQuotaRef,
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

const AI_ICON = `<span class="history-ai-btn__ico" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.35 4.42L18 8.5l-4.65 1.08L12 14l-1.35-4.42L6 8.5l4.65-1.08L12 3zm6 9l.9 2.95 3.1 1.05-3.1 1.05L18 21l-2.1-3.95L12 17.1l3.9-1.15L18 12z"/></svg></span>`;

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

function ensureSettingsModal(): HTMLElement | null {
    let modal = document.getElementById('problemIdeAiSettingsModal');
    if (modal) return modal;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
<div id="problemIdeAiSettingsModal" class="problem-ide-ai-modal problem-ide-ai-modal--hidden">
  <div class="problem-ide-ai-modal__mask" data-role="close"></div>
  <div class="problem-ide-ai-modal__dialog" role="dialog" aria-modal="true" aria-label="AI分析设置">
    <div class="problem-ide-ai-modal__title">AI分析设置</div>
    <label class="problem-ide-ai-panel__label">自定义API Key（仅本地保存）</label>
    <div id="problemIdeAiApiKeyHint" class="problem-ide-ai-panel__hint">留空使用官方API Key，每天有次数限制</div>
    <input id="problemIdeAiApiKey" class="problem-ide-ai-panel__input" type="password" placeholder="sk-..." autocomplete="off" />
    <label class="problem-ide-ai-panel__label">分析模型</label>
    <div id="problemIdeAiModelHint" class="problem-ide-ai-panel__hint">会员和管理员可切换模型</div>
    <select id="problemIdeAiModelPreset" class="problem-ide-ai-panel__input">
      <option value="deepseek-v4-flash">DeepSeek</option>
      <option value="kimi">Kimi</option>
      <option value="zhipu">智谱</option>
      <option value="tongyi-qianwen">通义千问</option>
      <option value="doubao">豆包</option>
    </select>
    <label class="problem-ide-ai-panel__label">模型名称（选填）</label>
    <input id="problemIdeAiCustomModel" class="problem-ide-ai-panel__input" type="text" placeholder="留空使用默认模型" autocomplete="off" />
    <label class="problem-ide-ai-panel__label">提示词模板</label>
    <textarea id="problemIdeAiPromptTemplate" class="problem-ide-ai-panel__textarea" rows="10"></textarea>
    <div class="problem-ide-ai-modal__footer">
      <button type="button" id="problemIdeAiSettingsCancel" class="problem-ide-ai-modal__btn">取消</button>
      <button type="button" id="problemIdeAiSettingsSave" class="problem-ide-ai-modal__btn problem-ide-ai-modal__btn--primary">保存</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(wrap.firstElementChild as HTMLElement);
    return document.getElementById('problemIdeAiSettingsModal');
}

function getRecordDetailUrl(rid: string): string {
    return UiContext.getRecordDetailUrl?.replace('%7Brid%7D', rid).replace('{rid}', rid) || `/record/${rid}`;
}

const DONE = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

export function initAiAnalysis() {
    const cfg = UiContext.aiAnalysis;
    if (!cfg?.enabled) return;
    if (document.getElementById('content-aiAnalysis') == null) return;

    ensureSettingsModal();
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

    const openAIAnalysis = async (rid: string, rdoc: any) => {
        if (!aiStartBtn || !aiStreamRoot) return;
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
            const codeText = String(detail?.rdoc?.code || rdoc.code || '');
            aiCurrentTarget = { rid, rdoc: detail?.rdoc || rdoc, code: codeText };
            syncStartBtn();
            aiStreamRoot.innerHTML = '<div class="record-ai-await-start"><button type="button" class="record-ai-await-start__btn" disabled>请点击上方“开始AI分析”</button></div>';
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

    document.addEventListener('problem-ide-ai-analysis-open', ((ev: Event) => {
        const d = (ev as CustomEvent<{ rid?: string; rdoc?: any }>).detail || {};
        const rid = String(d.rid || '').trim();
        if (!rid) return;
        void openAIAnalysis(rid, d.rdoc || { _id: rid });
    }) as EventListener);

    document.addEventListener('problem-ide-submit-result', ((ev: Event) => {
        const d = (ev as CustomEvent<{ rid?: string; status?: string; rdoc?: any }>).detail || {};
        const rid = String(d.rid || '').trim();
        if (!rid || !submitResultAiBtn) return;
        lastSubmitRid = rid;
        lastSubmitRdoc = d.rdoc || { _id: rid, status: d.status };
        submitResultAiBtn.hidden = false;
        submitResultAiBtn.onclick = () => {
            void openAIAnalysis(rid, lastSubmitRdoc || { _id: rid });
        };
    }) as EventListener);

    /** 增强历史表：注入 AI 列与按钮 */
    const enhanceHistory = (root: HTMLElement) => {
        const table = root.querySelector('table.history-table');
        if (!table || table.getAttribute('data-ai-enhanced') === '1') return;
        const theadRow = table.querySelector('thead tr');
        const tbody = table.querySelector('tbody');
        if (!theadRow || !tbody) return;
        if (![...theadRow.children].some((th) => /AI/.test(th.textContent || ''))) {
            const th = document.createElement('th');
            th.textContent = 'AI分析';
            theadRow.appendChild(th);
        }
        tbody.querySelectorAll('tr.history-row').forEach((row) => {
            if (row.querySelector('.history-ai-cell')) return;
            const href = (row as HTMLElement).dataset.href || '';
            const ridMatch = href.match(/\/record\/([a-f0-9]+)/i)
                || ((row as HTMLElement).dataset.rid ? [null, (row as HTMLElement).dataset.rid!] : null);
            const rid = ridMatch?.[1] || '';
            const cell = document.createElement('td');
            cell.className = 'history-ai-cell';
            if (rid) {
                cell.innerHTML = `<button type="button" class="history-ai-btn" data-rid="${escapeHtml(rid)}">${AI_ICON}AI分析</button>`;
                cell.querySelector('button')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    document.dispatchEvent(new CustomEvent('problem-ide-ai-analysis-open', {
                        detail: { rid },
                    }));
                });
            } else {
                cell.textContent = '-';
            }
            row.appendChild(cell);
        });
        table.setAttribute('data-ai-enhanced', '1');
    };

    const historyEl = document.getElementById('problemIdeHistory');
    if (historyEl) {
        const mo = new MutationObserver(() => enhanceHistory(historyEl));
        mo.observe(historyEl, { childList: true, subtree: true });
        enhanceHistory(historyEl);
    }

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
