import { Context } from 'hydrooj';

export function bindAssistantOnProblemIde(ctx: Context) {
    ctx.on('handler/after', async (that: any) => {
        const body = that.response?.body;
        if (!body) return;
        if (that.response.template !== 'problem_ide.html' && body.page_name !== 'problem_ide') return;
        try {
            const uid = Number(that.user?._id) || 0;
            body.aiAssistant = {
                enabled: uid > 0,
                streamUrl: '/ai-assistant/stream',
                historyUrl: '/ai-assistant/history',
                scene: 'acm-problem',
            };
        } catch {
            /* 助教挂掉不影响做题 */
        }
    });
}
