import { Context } from 'hydrooj';
import { bindProblemIdeRoute } from './handler/problemIde';
import { bindRedirectProblemDetailToIde } from './hooks/redirectDetail';

export function apply(ctx: Context) {
    bindRedirectProblemDetailToIde(ctx);
    bindProblemIdeRoute(ctx);
}
