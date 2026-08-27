import { Context, PRIV } from 'hydrooj';
import { SolutionEditHandler, SolutionManageHandler } from './handler/solutionEdit';
import { bindOfficialSolutionOnProblemIde } from './hooks/problemIde';

export function apply(ctx: Context) {
    ctx.Route('manage_problem_solution', '/manage/problem-solution', SolutionManageHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('manage_problem_solution_edit', '/manage/problem-solution/:pid', SolutionEditHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('markdown_edit', '/markdown_edit', SolutionEditHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.injectUI('ControlPanel', 'manage_problem_solution', { icon: 'file', after: 'manage_ai_analysis' }, PRIV.PRIV_EDIT_SYSTEM);
    ctx.i18n.load('zh', { manage_problem_solution: '题解编辑', TextSol: '题解' });
    ctx.i18n.load('en', { manage_problem_solution: 'Problem Solutions', TextSol: 'Solution' });
    bindOfficialSolutionOnProblemIde(ctx);
}
