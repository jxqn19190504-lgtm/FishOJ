import { Context } from 'hydrooj';
import { isObjectiveChoiceProblem } from '../lib/objective';

export function bindRedirectProblemDetailToIde(ctx: Context) {
    ctx.on('handler/after/ProblemDetail#get', async (that: any) => {
        const body = that.response?.body;
        const pdoc = body?.pdoc;
        if (!pdoc) return;
        if (!/^\/p\/[^/]+\/?$/.test(that.request?.path || '')) return;
        if (isObjectiveChoiceProblem(pdoc)) return;
        that.response.redirect = that.url('problem_ide', {
            pid: that.request?.params?.pid || pdoc.pid || pdoc.docId,
            query: that.request?.query || {},
        });
    });
}
