import { Handler, PRIV, ProblemModel } from 'hydrooj';
import { buildTutorContext } from '../lib/contextBuilder';
import { hashCode, nextHintLevel } from '../lib/hintPolicy';
import { generateTutorHint } from '../lib/provider';
import { addEvent, getSession, upsertSession } from '../model/tutorSession';

function asRun(a: Record<string, unknown>) {
    let v: unknown = a.run;
    if (typeof v === 'string') {
        try { v = JSON.parse(v); } catch { v = undefined; }
    }
    const o = (v && typeof v === 'object' ? v as Record<string, unknown> : {}) ;
    const pick = (k: string, flat: string) => o[k] != null ? o[k] : a[flat];
    const type = pick('type', 'runType');
    const input = pick('input', 'runInput');
    const expected = pick('expected', 'runExpected');
    const stdout = pick('stdout', 'runStdout');
    const stderr = pick('stderr', 'runStderr');
    const status = pick('status', 'runStatus');
    if (input == null && expected == null && stdout == null && status == null) return undefined;
    return {
        type: type === 'submit' ? 'submit' as const : 'pretest' as const,
        input: input != null ? String(input) : undefined,
        expected: expected != null ? String(expected) : undefined,
        stdout: stdout != null ? String(stdout) : undefined,
        stderr: stderr != null ? String(stderr) : undefined,
        status: status != null ? String(status) : undefined,
    };
}

export class AiTutorHintHandler extends Handler {
    async post() {
        this.response.type = 'application/json';
        const a = this.args as Record<string, unknown>;
        const pid = String(a.pid || '');
        const language = String(a.language || '');
        const code = String(a.code || '');
        const trigger = String(a.trigger || 'user_help');
        if (!pid) {
            this.response.body = { ok: false, error: '缺少题目' };
            return;
        }
        const domainId = this.args.domainId;
        const pdoc = await ProblemModel.get(domainId, pid);
        if (!pdoc) {
            this.response.body = { ok: false, error: '题目不存在' };
            return;
        }
        const key = String(pdoc.pid || pdoc.docId);
        let learning: any = null;
        try {
            learning = await this.ctx.db.collection('fish_learning_problem').findOne({
                domainId, pid: key,
            });
        } catch { /* ignore */ }
        if (learning && learning.tutorEnabled === false) {
            this.response.body = {
                ok: false,
                error: '本题未开启编程小助手',
            };
            return;
        }

        const uid = this.user.hasPriv(PRIV.PRIV_USER_PROFILE) ? this.user._id : 0;
        const prev = uid ? await getSession(this.ctx, uid, domainId, key) : null;
        const codeH = hashCode(code);
        const run = asRun(a);
        let examples: Array<{ input: string; output: string }> = [];
        const rawEx = a.examplesJson != null ? a.examplesJson : a.examples;
        if (typeof rawEx === 'string') {
            try { examples = JSON.parse(rawEx); } catch { examples = []; }
        } else if (Array.isArray(rawEx)) {
            examples = rawEx as any[];
        }
        examples = examples.slice(0, 4).map((e) => ({
            input: String(e?.input || ''),
            output: String(e?.output || e?.expected || ''),
        }));
        const codeChanged = !!(prev?.lastCodeHash && prev.lastCodeHash !== codeH);
        const errorChanged = !!(run?.status && prev?.lastStatus && prev.lastStatus !== run.status);
        const hintLevel = nextHintLevel({
            current: prev?.hintLevel || 0,
            maxLevel: learning?.maxHintLevel || 4,
            trigger,
            codeChanged,
            errorChanged,
            status: run?.status,
        });

        const ctx = await buildTutorContext({
            domainId,
            pid: key,
            language,
            code,
            run,
            examples,
            learning: learning || undefined,
            history: {
                hintLevel,
                hintCount: prev?.hintCount || 0,
                recentHints: (prev?.recentHints || []).slice(-6),
                scaffoldLevel: prev?.scaffoldLevel || 0,
            },
        });

        let payload;
        try {
            payload = await generateTutorHint(ctx, hintLevel);
        } catch {
            this.response.body = {
                ok: true,
                fallback: true,
                level: hintLevel,
                category: 'UNKNOWN',
                message: '小助手暂时没有生成提示，你可以先看看样例输入和自己的运行结果。',
                actions: [
                    { type: 'dismiss', label: '我再想想' },
                    { type: 'more_hint', label: '再试一次' },
                ],
            };
            return;
        }

        const recentHints = [...(prev?.recentHints || []), payload.message.slice(0, 80)].slice(-8);
        if (uid) {
            await upsertSession(this.ctx, uid, domainId, key, {
                hintLevel: payload.hintLevel,
                hintCount: (prev?.hintCount || 0) + 1,
                lastError: payload.errorCategory,
                lastCodeHash: codeH,
                lastStatus: run?.status,
                recentHints,
                completed: (run?.status || '').toUpperCase().includes('ACCEPT'),
            });
            await addEvent(this.ctx, {
                uid, domainId, pid: key, type: 'HINT_REQUEST',
                meta: { trigger, hintLevel: payload.hintLevel, category: payload.errorCategory },
            });
        }

        const isAc = (run?.status || '').toUpperCase().includes('ACCEPT');
        this.response.body = {
            ok: true,
            level: payload.hintLevel,
            category: payload.errorCategory,
            progressSummary: payload.progressSummary,
            focus: payload.focus,
            message: payload.message,
            shouldShowCode: payload.shouldShowCode,
            actions: isAc
                ? [{ type: 'dismiss', label: '知道了' }]
                : [
                    { type: 'dismiss', label: '我再想想' },
                    { type: 'more_hint', label: '再给一点提示' },
                ],
        };
    }
}
