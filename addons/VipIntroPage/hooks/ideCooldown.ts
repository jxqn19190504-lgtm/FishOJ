import { Context } from 'hydrooj';
import { isVipUser } from '../lib/vipRole';

/** 做题页只暴露 ideShortCooldown；是否会员由本插件写入。 */
export function bindIdeShortCooldown(ctx: Context) {
    ctx.on('handler/after', (that: any) => {
        const body = that.response?.body;
        if (!body) return;
        if (that.response.template !== 'problem_ide.html' && body.page_name !== 'problem_ide') return;
        body.ideShortCooldown = isVipUser(that.user);
    });
}
