import {
    Handler, param, PRIV, ProblemModel, Types,
} from 'hydrooj';
import { applyDemoScaffold } from '../lib/applyDemo';
import { formFlag, formStr, parseLines, parseStages } from '../lib/formParse';
import { codesByLang, codesFromArgs } from '../lib/scaffoldFields';
import {
    getLearningProblem, listScaffolds, upsertLearningProblem, upsertScaffold,
} from '../model/learning';

export class ScaffoldAdminHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    @param('pid', Types.String)
    async get(domainId: string, pid: string) {
        const pdoc = await ProblemModel.get(domainId, pid);
        const key = String(pdoc?.pid || pdoc?.docId || pid);
        const meta = await getLearningProblem(this.ctx, domainId, key);
        const scaffolds = await listScaffolds(this.ctx, domainId, key);
        const { py, cpp } = codesByLang(scaffolds);
        this.response.template = 'manage_coding_assist_problem.html';
        this.response.body = {
            page_name: 'manage_coding_assist_problem',
            pdoc,
            pid: key,
            meta,
            scaffolds,
            py,
            cpp,
        };
    }

    @param('pid', Types.String)
    async postFillDemo(domainId: string, pid: string) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        const pdoc = await ProblemModel.get(domainId, pid);
        const key = String(pdoc?.pid || pdoc?.docId || pid);
        await applyDemoScaffold(this.ctx, domainId, key);
        this.back();
    }

    @param('pid', Types.String)
    async postSave(domainId: string, pid: string) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        const a = this.args as Record<string, unknown>;
        const pdoc = await ProblemModel.get(domainId, pid);
        const key = String(pdoc?.pid || pdoc?.docId || pid);
        await upsertLearningProblem(this.ctx, domainId, key, {
            enabled: formFlag(a, 'enabled'),
            tutorEnabled: formFlag(a, 'tutorEnabled'),
            objectives: parseLines(formStr(a, 'objectives')),
            concepts: parseLines(formStr(a, 'concepts')),
            commonMistakes: parseLines(formStr(a, 'commonMistakes')),
            stages: parseStages(formStr(a, 'stages')),
            protectedStages: parseLines(formStr(a, 'protectedStages')),
        });
        for (const row of codesFromArgs(a, (k) => formStr(a, k))) {
            await upsertScaffold(this.ctx, {
                domainId, pid: key, language: row.language, level: row.level, code: row.code,
            });
        }
        this.back();
    }
}
