import { Context, PRIV } from 'hydrooj';

/** 登录用户每日官方 Key 分析次数；PRIV_EDIT_SYSTEM 不限 */
export const AI_ANALYSIS_DAILY_LIMIT = 20;

const COLL = 'fish_ai_analysis_daily';

export class AiAnalysisStreamClientClosedError extends Error {
    constructor(message = 'client_sse_closed', cause?: unknown) {
        super(message);
        this.name = 'AiAnalysisStreamClientClosedError';
        if (cause !== undefined) (this as Error & { cause?: unknown }).cause = cause;
    }
}

function localTodayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function coll(ctx: Context) {
    return ctx.db.collection(COLL);
}

export function formatAiAnalysisQuotaForbiddenMessage(dailyLimit = AI_ANALYSIS_DAILY_LIMIT): string {
    return `今日 AI 分析次数已用完（每日 ${dailyLimit} 次），明日刷新。`;
}

export function resolveAiAnalysisQuota(user: {
    _id?: number;
    hasPriv?: (p: unknown) => boolean;
}): { applyQuota: boolean; dailyLimit: number; unlimited: boolean } {
    const uid = Number(user?._id);
    if (!uid) return { applyQuota: false, dailyLimit: 0, unlimited: false };
    if (typeof user.hasPriv === 'function' && user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) {
        return { applyQuota: false, dailyLimit: 0, unlimited: true };
    }
    return { applyQuota: true, dailyLimit: AI_ANALYSIS_DAILY_LIMIT, unlimited: false };
}

export async function ensureAiAnalysisQuotaIndexes(ctx: Context) {
    try {
        await coll(ctx).createIndex(
            { uid: 1, date: 1 },
            { unique: true, name: 'fish_ai_analysis_uid_date' },
        );
    } catch (e: any) {
        console.log('ensureAiAnalysisQuotaIndexes:', e?.message);
    }
}

export async function peekAiAnalysisRemaining(
    ctx: Context,
    uid: number,
    dailyLimit: number,
): Promise<{ remaining: number; dailyLimit: number }> {
    const date = localTodayStr();
    const doc = await coll(ctx).findOne({ uid, date });
    const used = typeof doc?.count === 'number' ? doc.count : 0;
    return { remaining: Math.max(0, dailyLimit - used), dailyLimit };
}

export async function tryConsumeAiAnalysis(
    ctx: Context,
    uid: number,
    dailyLimit: number,
): Promise<{ ok: boolean; remaining: number; dailyLimit: number }> {
    const date = localTodayStr();
    const key = { uid, date };
    for (let attempt = 0; attempt < 5; attempt++) {
        let doc = await coll(ctx).findOne(key);
        if (!doc) {
            try {
                await coll(ctx).insertOne({ ...key, count: 0 });
            } catch (e: any) {
                if (e?.code !== 11000) throw e;
            }
            doc = await coll(ctx).findOne(key);
        }
        const current = typeof doc?.count === 'number' ? doc.count : 0;
        if (current >= dailyLimit) {
            return { ok: false, remaining: 0, dailyLimit };
        }
        const res = await coll(ctx).updateOne(
            { ...key, count: current },
            { $inc: { count: 1 } },
        );
        if (res.modifiedCount === 1) {
            return {
                ok: true,
                remaining: Math.max(0, dailyLimit - (current + 1)),
                dailyLimit,
            };
        }
    }
    return { ok: false, remaining: 0, dailyLimit };
}

export async function rollbackAiAnalysisConsume(ctx: Context, uid: number): Promise<void> {
    const date = localTodayStr();
    const key = { uid, date };
    for (let attempt = 0; attempt < 5; attempt++) {
        const doc = await coll(ctx).findOne(key);
        const current = typeof doc?.count === 'number' ? doc.count : 0;
        if (current <= 0) return;
        const res = await coll(ctx).updateOne(
            { ...key, count: current },
            { $inc: { count: -1 } },
        );
        if (res.modifiedCount === 1) return;
    }
}

/** 客户端断连不回滚；上游 API/空结果失败则回滚 */
export function shouldRollbackAfterOfficialStreamFailure(err: unknown): boolean {
    if (err instanceof AiAnalysisStreamClientClosedError) return false;
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'EPIPE' || code === 'ERR_STREAM_WRITE_AFTER_END') return false;
    const msg = String((err as Error)?.message ?? err ?? '');
    if (/write after end/i.test(msg)) return false;
    return true;
}
