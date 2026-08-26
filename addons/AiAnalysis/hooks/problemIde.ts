import { Context, PRIV } from 'hydrooj';
import {
    AI_ANALYSIS_DAILY_LIMIT,
    peekAiAnalysisRemaining,
    resolveAiAnalysisQuota,
} from '../lib/quota';

function canUseCustomApiKey(user: any, ideShortCooldown: boolean): boolean {
    if (!user) return false;
    if (typeof user.hasPriv === 'function' && user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) return true;
    if (ideShortCooldown) return true;
    const role = String(user.role || '').toLowerCase();
    if (role === 'vip') return true;
    if (Array.isArray(user.roles) && user.roles.some((r: unknown) => String(r).toLowerCase() === 'vip')) {
        return true;
    }
    return false;
}

export function bindAiAnalysisOnProblemIde(ctx: Context) {
    ctx.on('handler/after', async (that: any) => {
        const body = that.response?.body;
        if (!body) return;
        if (that.response.template !== 'problem_ide.html' && body.page_name !== 'problem_ide') return;
        try {
            const uid = Number(that.user?._id) || 0;
            const q = resolveAiAnalysisQuota(that.user);
            let remaining = 0;
            let dailyLimit: number | null = q.dailyLimit || AI_ANALYSIS_DAILY_LIMIT;
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
                quotaUrl: '/ai-analysis/quota',
                canUseCustomApiKey: canUseCustomApiKey(that.user, !!body.ideShortCooldown),
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
                            dailyLimit: AI_ANALYSIS_DAILY_LIMIT,
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
