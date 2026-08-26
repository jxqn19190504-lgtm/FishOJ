import { Context } from 'hydrooj';

export function bindTutorOnProblemIde(ctx: Context) {
    ctx.on('handler/after', async (that: any) => {
        const body = that.response?.body;
        if (!body) return;
        if (that.response.template !== 'problem_ide.html' && body.page_name !== 'problem_ide') return;
        body.learning = body.learning || { scaffoldEnabled: false, tutorEnabled: false };
        try {
            const pdoc = body.pdoc;
            const pid = String(pdoc?.pid || pdoc?.docId || '');
            const domainId = that.args?.domainId;
            if (!pid || !domainId) return;
            const meta = await ctx.db.collection('fish_learning_problem').findOne({ domainId, pid });
            if (meta && (meta.enabled === false || meta.tutorEnabled === false)) return;
            body.learning.tutorEnabled = true;
            body.learning.tutor = {
                hintUrl: '/ai-tutor/hint',
                pid,
            };
        } catch {
            /* AI 挂掉不影响做题 */
        }
    });
}
