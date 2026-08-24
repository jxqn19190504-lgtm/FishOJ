import {
    Context, PERM, PRIV, PermissionError, ProblemModel, SettingModel,
} from 'hydrooj';

function isObjectiveChoiceProblem(pdoc: { config?: unknown } | null | undefined): boolean {
    const config = pdoc?.config;
    if (!config || typeof config !== 'object') return false;
    return (config as { type?: unknown }).type === 'objective';
}

function buildLangRange(pdoc: { config?: unknown }): Record<string, string> {
    const cfg = pdoc?.config;
    const langs = (typeof cfg === 'object' && cfg && Array.isArray((cfg as { langs?: string[] }).langs))
        ? (cfg as { langs: string[] }).langs
        : [];
    const range = SettingModel.SETTINGS_BY_KEY.codeLang.range as Record<string, string>;
    if (!langs.length) return { ...range };
    return Object.fromEntries(
        langs
            .filter((i) => SettingModel.langs[i] && !(SettingModel.langs[i] as { disabled?: boolean }).disabled)
            .map((i) => [i, (SettingModel.langs[i] as { display?: string })?.display || i]),
    );
}

/**
 * FishOJ 在线编程页：/ide/:pid
 * 对照 codefun2000 ProblemPages：左右分栏 + Monaco + 自测/提交。
 * 题库抽屉 / 章节 / 会员入口已接上；无题库或 VIP 插件时走空状态。
 */
export function apply(ctx: Context) {
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
