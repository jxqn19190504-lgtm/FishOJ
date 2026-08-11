import { Context, PERM, ProblemConfigError, SettingModel, param, Types } from 'hydrooj';

/**
 * FishOJ 最小版独立在线编程页：/ide/:pid
 *
 * 原理（参考 codefun2000 的 ProblemPages 插件）：
 * 1. ctx.withHandlerClass 拿到官方 ProblemSubmitHandler（含完整提交逻辑）
 * 2. 子类 ProblemIdeHandler 继承它：
 *    - prepare(): 跳过父类的 config 校验（兼容 remote_judge 题，config 为 yaml 字符串，题面可看）
 *    - get(): 复用官方数据组装后改渲染 IDE 模板
 *    - post(): 复用官方提交逻辑；远程评测题给出明确提示
 * 3. ctx.Route 注册 /ide/:pid 路由（PERM_VIEW_PROBLEM：游客可看题）
 */
export function apply(ctx: Context) {
    ctx.withHandlerClass('ProblemSubmitHandler', (ProblemSubmitHandler) => {
        class ProblemIdeHandler extends ProblemSubmitHandler {
            async prepare() {
                // 跳过父类 prepare 的 config 校验（typeof config === 'string' 会抛
                // ProblemConfigError），让远程评测题也能打开 IDE 页面看题面。
                // pdoc 由父类链的 _prepare 加载，不受影响。
            }

            async get(...args: any[]) {
                // 调用官方 get()：组装 langRange、page_name 等全部数据
                await super.get(...args);
                const self = this as any;
                // 只覆盖模板与页面名
                self.response.template = 'problem_ide.html';
                self.response.body.page_name = 'problem_ide';
            }

            @param('lang', Types.Name)
            @param('code', Types.String, true)
            @param('pretest', Types.Boolean)
            @param('input', Types.ArrayOf(Types.String, true), true)
            @param('tid', Types.ObjectId, true)
            async post(domainId: string, lang: string, code: string, pretest = false, input: string[] = [], tid?: any) {
                const self = this as any;
                if (typeof self.pdoc?.config === 'string') {
                    throw new ProblemConfigError('远程评测题暂不支持在本 OJ 提交评测');
                }
                return super.post(domainId, lang, code, pretest, input, tid);
            }
        }
        ctx.Route('problem_ide', '/ide/:pid', ProblemIdeHandler, PERM.PERM_VIEW_PROBLEM);
    });

    // 改路由：访问 /p/:pid 时 URL 不变，直接渲染 IDE 模板（不跳转）
    // 正则只匹配 /p/xxx 与 /p/xxx/，不影响 /p/xxx/edit、/p/xxx/file 等深层路由
    ctx.on('handler/after/ProblemDetail#get', async (that: any) => {
        const body = that.response?.body;
        if (!body) return;
        const pdoc = body.pdoc;
        if (!pdoc) return;
        if (/^\/p\/[^/]+\/?$/.test(that.request?.path || '')) {
            that.response.template = 'problem_ide.html';
            that.response.body.page_name = 'problem_ide';
            // ProblemDetail#get 不提供 langRange，手动补上（参照 ProblemSubmitHandler.get）
            that.response.body.langRange = (typeof pdoc.config === 'object' && pdoc.config.langs)
                ? Object.fromEntries(pdoc.config.langs.map((i) => [i, SettingModel.langs[i]?.display || i]))
                : SettingModel.SETTINGS_BY_KEY.codeLang.range;
        }
    });
}
