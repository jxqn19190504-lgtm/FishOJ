import { Context } from 'hydrooj';
import { isAssistantEnabledFromSettings } from '../lib/assistantSettings';

async function readProblemAssistFlags(ctx: Context, domainId: string, pid: string) {
    try {
        return await ctx.db.collection('fish_learning_problem').findOne({ domainId, pid });
    } catch {
        return null;
    }
}

export function bindAssistantOnProblemIde(ctx: Context) {
    ctx.on('handler/after', async (that: any) => {
        const body = that.response?.body;
        if (!body) return;
        if (that.response.template !== 'problem_ide.html' && body.page_name !== 'problem_ide') return;
        try {
            const uid = Number(that.user?._id) || 0;
            if (!uid || !isAssistantEnabledFromSettings()) {
                body.aiAssistant = { enabled: false, scene: 'acm-problem' };
                body.learning = body.learning || { scaffoldEnabled: false, tutorEnabled: false };
                body.learning.assistantEnabled = false;
                return;
            }
            const pdoc = body.pdoc;
            const pid = String(pdoc?.pid || pdoc?.docId || '');
            const domainId = that.args?.domainId;
            let perProblem = true;
            if (pid && domainId) {
                const meta = await readProblemAssistFlags(ctx, domainId, pid);
                if (meta && meta.assistantEnabled === false) perProblem = false;
            }
            const enabled = perProblem;
            body.aiAssistant = {
                enabled,
                streamUrl: '/ai-assistant/stream',
                historyUrl: '/ai-assistant/history',
                scene: 'acm-problem',
            };
            body.learning = body.learning || { scaffoldEnabled: false, tutorEnabled: false };
            body.learning.assistantEnabled = enabled;
        } catch {
            /* 助教挂掉不影响做题 */
        }
    });
}
