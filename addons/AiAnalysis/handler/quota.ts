import { Handler, PRIV } from 'hydrooj';
import {
    peekAiAnalysisRemaining,
    resolveAiAnalysisQuota,
    AI_ANALYSIS_DAILY_LIMIT,
} from '../lib/quota';

/** GET `/ai-analysis/quota` — 刷新今日剩余次数 */
export class AiAnalysisQuotaHandler extends Handler {
    async get() {
        const uid = Number(this.user._id);
        if (!uid) {
            this.response.body = {
                limited: true,
                remaining: 0,
                dailyLimit: AI_ANALYSIS_DAILY_LIMIT,
                source: 'daily_count',
                error: '未登录',
            };
            return;
        }
        const q = resolveAiAnalysisQuota(this.user as any);
        if (!q.applyQuota) {
            this.response.body = {
                limited: false,
                remaining: 0,
                dailyLimit: null,
                unlimited: true,
                source: 'daily_count',
                canUseCustomApiKey: this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM),
            };
            return;
        }
        const peek = await peekAiAnalysisRemaining(this.ctx, uid, q.dailyLimit);
        this.response.body = {
            limited: true,
            remaining: peek.remaining,
            dailyLimit: peek.dailyLimit,
            source: 'daily_count',
            canUseCustomApiKey: this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM),
        };
    }
}
