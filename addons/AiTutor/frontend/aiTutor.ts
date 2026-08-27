import { request } from '@hydrooj/ui-default';

declare const UiContext: {
    learning?: {
        tutorEnabled?: boolean;
        tutor?: { hintUrl?: string; pid?: string };
    };
    aiAssistant?: {
        enabled?: boolean;
    };
};

declare global {
    interface Window {
        FishOJProblemIde?: {
            getSnapshot: () => {
                pid: string;
                language: string;
                code: string;
                cases: Array<{ input: string; expected: string }>;
                lastRun?: {
                    type: string;
                    input?: string;
                    expected?: string;
                    stdout?: string;
                    stderr?: string;
                    status?: string;
                };
            };
        };
    }
}

function examplesFromDom() {
    const host = document.getElementById('problemIdeProblemContent');
    if (!host) return [] as Array<{ input: string; output: string }>;
    const stacks = host.querySelectorAll('.problem-ide-sample-stack');
    const out: Array<{ input: string; output: string }> = [];
    stacks.forEach((stack) => {
        const cols = stack.querySelectorAll(':scope > .sample');
        const pre = (el: Element | undefined) => (el?.querySelector('pre')?.textContent || '').replace(/\n$/, '');
        if (cols[0]) out.push({ input: pre(cols[0]), output: pre(cols[1]) });
    });
    return out.slice(0, 4);
}

export function initAiTutor() {
    const cfg = UiContext.learning;
    if (!cfg?.tutorEnabled || !cfg.tutor?.hintUrl) return;
    const hintUrl = cfg.tutor.hintUrl;
    const pid = cfg.tutor.pid || '';

    const root = document.createElement('div');
    root.className = 'fish-tutor';
    root.innerHTML = `
      <div class="fish-tutor-offer" id="fishTutorOffer" hidden>
        <div>好像在同一个地方遇到了一点麻烦。需要一个小线索吗？</div>
        <div class="fish-tutor__actions" style="padding:10px 0 0">
          <button type="button" class="fish-tutor__btn" id="fishTutorOfferNo">我再试试</button>
          <button type="button" class="fish-tutor__btn fish-tutor__btn--primary" id="fishTutorOfferYes">给我一个提示</button>
        </div>
      </div>
      <div class="fish-tutor__panel" id="fishTutorPanel" hidden>
        <div class="fish-tutor__head">
          <span>编程小助手</span>
          <button type="button" class="fish-tutor__close" id="fishTutorClose" aria-label="关闭">×</button>
        </div>
        <div class="fish-tutor__body" id="fishTutorBody">我在看着你的代码。需要时点下面的按钮，我会给最小的提示。</div>
        <div class="fish-tutor__meta" id="fishTutorMeta"></div>
        <div class="fish-tutor__actions">
          <button type="button" class="fish-tutor__btn" id="fishTutorDismiss">我再想想</button>
          <button type="button" class="fish-tutor__btn fish-tutor__btn--primary" id="fishTutorMore">给我提示</button>
        </div>
        <div class="fish-tutor__ask">
          <input id="fishTutorAsk" placeholder="你也可以问我……" maxlength="200" />
        </div>
      </div>
      <button type="button" class="fish-tutor__fab" id="fishTutorFab" data-state="idle" title="编程小助手">🤖</button>
    `;
    document.body.appendChild(root);

    const embedInAssistant = UiContext.aiAssistant?.enabled === true;
    if (embedInAssistant) {
        root.classList.add('fish-tutor--fab-hidden');
    }

    const panel = document.getElementById('fishTutorPanel');
    const body = document.getElementById('fishTutorBody');
    const meta = document.getElementById('fishTutorMeta');
    const fab = document.getElementById('fishTutorFab') as HTMLButtonElement | null;
    const offer = document.getElementById('fishTutorOffer');

    const setState = (s: string) => { if (fab) fab.dataset.state = s; };
    const open = () => panel?.removeAttribute('hidden');
    const close = () => panel?.setAttribute('hidden', '');

    fab?.addEventListener('click', () => {
        if (panel?.hasAttribute('hidden')) open();
        else close();
    });
    document.getElementById('fishTutorClose')?.addEventListener('click', close);
    document.getElementById('fishTutorDismiss')?.addEventListener('click', close);

    let failStreak = 0;
    let lastCode = '';
    let quietUntil = 0;
    let busy = false;

    async function askHint(trigger: string) {
        if (busy) return;
        const snap = window.FishOJProblemIde?.getSnapshot?.();
        if (!snap) {
            if (body) body.textContent = '编辑器还没准备好。';
            open();
            return;
        }
        busy = true;
        setState('busy');
        if (body) body.textContent = '我在看你现在的代码和刚才的运行结果…';
        open();
        try {
            const res = await request.post(hintUrl, {
                pid: snap.pid || pid,
                language: snap.language,
                code: snap.code,
                trigger,
                runType: snap.lastRun?.type || '',
                runInput: snap.lastRun?.input || '',
                runExpected: snap.lastRun?.expected || '',
                runStdout: snap.lastRun?.stdout || '',
                runStderr: snap.lastRun?.stderr || '',
                runStatus: snap.lastRun?.status || '',
                examplesJson: JSON.stringify(examplesFromDom().length ? examplesFromDom() : snap.cases.map((c) => ({
                    input: c.input, output: c.expected,
                }))),
            }) as {
                ok?: boolean;
                message?: string;
                level?: number;
                category?: string;
                progressSummary?: string;
                error?: string;
            };
            if (!res?.ok) {
                if (body) body.textContent = res?.error || '小助手暂时没有生成提示，你可以先看看样例输入和自己的运行结果。';
                setState('idle');
                return;
            }
            if (body) body.textContent = res.message || '';
            if (meta) {
                const bits = [
                    res.progressSummary,
                    res.level ? `提示强度 H${res.level}` : '',
                    res.category && res.category !== 'NONE' ? res.category : '',
                ].filter(Boolean);
                meta.textContent = bits.join(' · ');
            }
            setState((snap.lastRun?.status || '').toUpperCase().includes('ACCEPT') ? 'ok' : 'hint');
        } catch {
            if (body) body.textContent = '小助手暂时没有生成提示，你可以先看看样例输入和自己的运行结果。';
            setState('idle');
        } finally {
            busy = false;
        }
    }

    document.getElementById('fishTutorMore')?.addEventListener('click', () => void askHint('user_help'));
    document.getElementById('fishTutorAsk')?.addEventListener('keydown', (ev) => {
        if ((ev as KeyboardEvent).key === 'Enter') void askHint('user_help');
    });
    document.getElementById('fishTutorOfferYes')?.addEventListener('click', () => {
        offer?.setAttribute('hidden', '');
        void askHint('user_help');
    });
    document.getElementById('fishTutorOfferNo')?.addEventListener('click', () => {
        offer?.setAttribute('hidden', '');
        quietUntil = Date.now() + 3 * 60 * 1000;
        setState('idle');
    });

    document.addEventListener('problem-ide-hint-request', () => void askHint('user_help'));

    document.addEventListener('problem-ide-tutor-open', ((ev: Event) => {
        const d = (ev as CustomEvent<{ requestHint?: boolean }>).detail || {};
        open();
        if (d.requestHint !== false) void askHint('user_help');
    }) as EventListener);

    document.addEventListener('problem-ide-run-result', ((ev: Event) => {
        const d = (ev as CustomEvent<{ status?: string; stdout?: string }>).detail || {};
        const st = (d.status || '').toUpperCase();
        const snap = window.FishOJProblemIde?.getSnapshot?.();
        const code = snap?.code || '';
        const similar = lastCode && code.replace(/\s+/g, '') === lastCode.replace(/\s+/g, '');
        lastCode = code;
        if (st.includes('ACCEPT')) {
            failStreak = 0;
            setState('ok');
            void askHint('accepted');
            return;
        }
        if (!st || st.includes('WAITING') || st.includes('JUDGING')) return;
        failStreak = similar ? failStreak + 1 : 1;
        setState('watch');
        if (failStreak >= 3 && Date.now() > quietUntil) {
            offer?.removeAttribute('hidden');
            setState('hint');
        }
    }) as EventListener);

    document.addEventListener('problem-ide-submit-result', ((ev: Event) => {
        const d = (ev as CustomEvent<{ status?: string }>).detail || {};
        if ((d.status || '').toUpperCase().includes('ACCEPT')) {
            setState('ok');
            void askHint('accepted');
        }
    }) as EventListener);
}
