import { Handler, param, PRIV, ProblemModel, Types } from 'hydrooj';
import { levelForMode, MODE_LABELS, normalizeLangKey } from '../lib/policy';
import { builtinScaffold } from '../lib/builtinTemplates';
import { getLearningProblem, getScaffold, saveChoice } from '../model/learning';

export class ScaffoldConfigHandler extends Handler {
    @param('pid', Types.String)
    async get(domainId: string, pid: string) {
        this.response.type = 'application/json';
        const pdoc = await ProblemModel.get(domainId, pid);
        const key = String(pdoc?.pid || pdoc?.docId || pid);
        const meta = await getLearningProblem(this.ctx, domainId, key);
        if (meta && meta.enabled === false) {
            this.response.body = { enabled: false };
            return;
        }
        this.response.body = {
            enabled: true,
            modes: MODE_LABELS,
            concepts: meta?.concepts || [],
            stages: meta?.stages || [],
        };
    }
}

export class ScaffoldSelectHandler extends Handler {
    async post() {
        this.response.type = 'application/json';
        const a = this.args as Record<string, unknown>;
        const domainId = this.args.domainId as string;
        const pid = String(a.pid || '');
        const mode = Number(a.mode);
        const language = String(a.language || '');
        const pdoc = await ProblemModel.get(domainId, pid);
        if (!pdoc) {
            this.response.body = { ok: false, error: '题目不存在' };
            return;
        }
        const key = String(pdoc.pid || pdoc.docId);
        const meta = await getLearningProblem(this.ctx, domainId, key);
        if (meta && meta.enabled === false) {
            this.response.body = { ok: false, error: '本题已关闭教学模式' };
            return;
        }
        const m = (mode === 1 || mode === 2 ? mode : 0) as 0 | 1 | 2;
        const level = levelForMode(m);
        const langFamily = normalizeLangKey(language);
        let row = await getScaffold(this.ctx, domainId, key, langFamily, level);
        if (!row && langFamily !== 'python') {
            row = await getScaffold(this.ctx, domainId, key, 'python', level);
        }
        const code = row?.code ?? builtinScaffold(langFamily, level);
        const uid = this.user.hasPriv(PRIV.PRIV_USER_PROFILE) ? this.user._id : 0;
        if (uid) {
            await saveChoice(this.ctx, {
                uid, domainId, pid: key, mode: m, scaffoldLevel: level, language,
            });
        }
        this.response.body = {
            ok: true,
            mode: m,
            scaffoldLevel: level,
            language: langFamily,
            code,
        };
    }
}
