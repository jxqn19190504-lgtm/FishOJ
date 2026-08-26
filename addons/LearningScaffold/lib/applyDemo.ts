import { Context } from 'hydrooj';
import { upsertLearningProblem, upsertScaffold } from '../model/learning';
import { DEMO_META, DEMO_SCAFFOLDS } from './demoTemplates';

export async function applyDemoScaffold(ctx: Context, domainId: string, pid: string) {
    await upsertLearningProblem(ctx, domainId, pid, {
        enabled: true,
        tutorEnabled: true,
        ...DEMO_META,
    });
    for (const [language, levels] of Object.entries(DEMO_SCAFFOLDS)) {
        for (const [lv, code] of Object.entries(levels)) {
            await upsertScaffold(ctx, {
                domainId, pid, language, level: Number(lv), code,
            });
        }
    }
}
