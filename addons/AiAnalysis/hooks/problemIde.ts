import { Context } from 'hydrooj';
import { isAnalysisEnabledFromSettings } from '../lib/analysisSettings';
import {
    peekAiAnalysisRemaining,
    resolveAiAnalysisQuota,
} from '../lib/quota';

async function readProblemAnalysisFlag(ctx: Context, domainId: string, pid: string) {
    try {
        return await ctx.db.collection('fish_learning_problem').findOne({ domainId, pid });
    } catch {
        return null;
    }
}

export function bindAiAnalysisOnProblemIde(ctx: Context) {
    ctx.on('handler/after', async (that: any) => {
        const body = that.response?.body;
        if (!body) return;
        if (that.response.template !== 'problem_ide.html' && body.page_name !== 'problem_ide') return;
        try {
            if (!isAnalysisEnabledFromSettings()) {
                body.aiAnalysis = { enabled: false };
                return;
            }
            const pdoc = body.pdoc;
            const pid = String(pdoc?.pid || pdoc?.docId || '');
            const domainId = that.args?.domainId;
            if (pid && domainId) {
                const meta = await readProblemAnalysisFlag(ctx, domainId, pid);
                if (meta && meta.analysisEnabled === false) {
                    body.aiAnalysis = { enabled: false };
                    return;
                }
            }
            const uid = Number(that.user?._id) || 0;
            const q = resolveAiAnalysisQuota(that.user);
            let remaining = 0;
            let dailyLimit: number | null = q.dailyLimit;
            const unlimited = !!q.unlimited;
            if (uid && q.applyQuota) {
                const peek = await peekAiAnalysisRemaining(ctx, uid, q.dailyLimit);
                remaining = peek.remaining;
                dailyLimit = peek.dailyLimit;
            }
            body.aiAnalysis = {
                enabled: true,
                streamUrl: '/ai-analysis/stream',
                cacheUrl: '/ai-analysis/cache',
                quotaUrl: '/api/problem/ide-ai-quota',
                quota: unlimited || !uid
                    ? (unlimited
                        ? {
                            limited: false,
                            remaining: 0,
                            dailyLimit: null,
                            unlimited: true,
                            source: 'daily_count',
                        }
                        : {
                            limited: true,
                            remaining: 0,
                            dailyLimit,
                            source: 'daily_count',
                        })
                    : {
                        limited: true,
                        remaining,
                        dailyLimit,
                        source: 'daily_count',
                    },
            };
        } catch {
            /* AI 分析挂掉不影响做题 */
        }
    });
}
