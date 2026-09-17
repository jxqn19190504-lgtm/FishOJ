import { Context } from 'hydrooj';
import { getTextSolution } from '../lib/ProblemSolutionUtils';

export function bindOfficialSolutionOnProblemIde(ctx: Context) {
    ctx.on('handler/after', async (that: any) => {
        const body = that.response?.body;
        if (!body?.pdoc) return;
        if (that.response.template !== 'problem_ide.html' && body.page_name !== 'problem_ide') return;
        try {
            const domainId = that.args?.domainId;
            const pdoc = body.pdoc;
            if (!domainId || !pdoc?.docId) return;
            const textSol = await getTextSolution(domainId, pdoc);
            if (textSol) {
                pdoc.textSol = textSol;
            }
        } catch {
            /* 题解加载失败不影响做题 */
        }
    });
}
