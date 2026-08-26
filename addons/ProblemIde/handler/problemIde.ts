import {
    Context, PERM, PRIV, PermissionError, ProblemModel,
} from 'hydrooj';
import { buildLangRange } from '../lib/langRange';
import { isObjectiveChoiceProblem } from '../lib/objective';

export function bindProblemIdeRoute(ctx: Context) {
    ctx.withHandlerClass('ProblemSubmitHandler', (ProblemSubmitHandler) => {
        class ProblemIDEHandler extends ProblemSubmitHandler {
            async prepare() {
                /* 跳过父类 config 校验，远程评测题 config 可能仍是 yaml 字符串 */
            }

            async get() {
                const self = this as any;
                const pid = self.request.params.pid;
                const pdoc = await ProblemModel.get(self.args.domainId, pid);
                if (!ProblemModel.canViewBy(pdoc, self.user)) {
                    throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
                }
                if (isObjectiveChoiceProblem(pdoc)) {
                    self.response.redirect = self.url('problem_detail', {
                        pid: self.request.params.pid,
                        query: self.request.query || {},
                    });
                    return;
                }
                self.pdoc = pdoc;
                const isLoggedIn = self.user.hasPriv(PRIV.PRIV_USER_PROFILE);
                const canSubmitProblem = isLoggedIn && self.user.hasPerm(PERM.PERM_SUBMIT_PROBLEM);
                const langRange = buildLangRange(pdoc);

                self.response.body.pdoc = pdoc;
                self.response.body.title = pdoc.title;
                self.response.body.langRange = langRange;
                self.response.body.problemConfig = {
                    login_required: !isLoggedIn,
                    can_submit: canSubmitProblem,
                };
                self.response.body.problemIdeLoginRequired = !isLoggedIn;
                self.response.body.problemIdeCanSubmit = canSubmitProblem;
                self.response.body.ideShortCooldown = false;
                self.response.body.learning = {
                    scaffoldEnabled: false,
                    tutorEnabled: false,
                };
                self.response.body.problemIdeHost = {
                    pid: pdoc.pid || pdoc.docId,
                    docId: pdoc.docId,
                    domainId: self.args.domainId,
                    title: pdoc.title,
                };
                if (self.tdoc) self.response.body.tdoc = self.tdoc;
                self.response.template = 'problem_ide.html';
                self.response.body.page_name = 'problem_ide';
            }

            async post() {
                throw new PermissionError(PERM.PERM_SUBMIT_PROBLEM);
            }
        }
        ctx.Route('problem_ide', '/ide/:pid', ProblemIDEHandler, PERM.PERM_VIEW_PROBLEM);
    });
}
