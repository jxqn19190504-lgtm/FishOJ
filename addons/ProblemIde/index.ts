import { Context, PERM } from 'hydrooj';

/**
 * FishOJ 最小版独立在线编程页：/ide/:pid
 *
 * 原理（参考 codefun2000 的 ProblemPages 插件）：
 * 1. ctx.withHandlerClass 拿到官方 ProblemSubmitHandler（含完整提交逻辑）
 * 2. 子类 ProblemIdeHandler 继承它：get() 复用官方数据组装后改渲染 IDE 模板；
 *    post() 完全继承官方提交逻辑（提交代码 → 评测）
 * 3. ctx.Route 注册 /ide/:pid 路由
 */
export function apply(ctx: Context) {
    ctx.withHandlerClass('ProblemSubmitHandler', (ProblemSubmitHandler) => {
        class ProblemIdeHandler extends ProblemSubmitHandler {
            async get(...args: any[]) {
                // 调用官方 get()：组装 pdoc、udoc、psdoc、langRange 等全部数据
                await super.get(...args);
                const self = this as any;
                // 只覆盖模板与页面名，其余数据全部复用官方
                self.response.template = 'problem_ide.html';
                self.response.body.page_name = 'problem_ide';
            }
        }
        ctx.Route('problem_ide', '/ide/:pid', ProblemIdeHandler, PERM.PERM_VIEW_PROBLEM);
    });
}
