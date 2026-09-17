import { Context } from 'hydrooj';

const COLL = 'fish_ai_analysis_log';
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export type AiAnalysisLogEntry = {
    uid: number;
    uname?: string;
    rid: string;
    domainId?: string;
    problemDocId?: number;
    problemPid?: string | number;
    provider?: string;
    model?: string;
    useCustomApiKey: boolean;
    disableCache?: boolean;
    fromCache?: boolean;
    quotaConsumed?: boolean;
    success: boolean;
    error?: string;
};

export type AiAnalysisLogDoc = AiAnalysisLogEntry & {
    _id?: unknown;
    time?: Date;
};

function coll(ctx: Context) {
    return ctx.db.collection(COLL);
}

function buildAiAnalysisLogFilter(query: {
    uid?: number;
    uname?: string;
    rid?: string;
    success?: boolean;
}): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    const uid = Number(query.uid);
    if (Number.isInteger(uid) && uid > 0) {
        filter.uid = uid;
    } else if (typeof query.uname === 'string' && query.uname.trim()) {
        filter.uname = query.uname.trim();
    }
    const rid = String(query.rid || '').trim();
    if (rid) filter.rid = rid;
    if (typeof query.success === 'boolean') filter.success = query.success;
    return filter;
}

function clampAiAnalysisLogPage(page?: number, pageSize?: number) {
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE));
    const p = Math.max(1, Number(page) || 1);
    return { page: p, pageSize: size };
}

/** 提交记录 AI 分析调用审计（不落 API Key），对齐 CodeFun RecordAiAnalysisLog */
export async function ensureAiAnalysisLogIndexes(ctx: Context) {
    try {
        await coll(ctx).createIndex({ time: -1 }, { name: 'fish_ai_log_time' });
        await coll(ctx).createIndex({ uid: 1, time: -1 }, { name: 'fish_ai_log_uid_time' });
        await coll(ctx).createIndex({ rid: 1, time: -1 }, { name: 'fish_ai_log_rid_time' });
    } catch (e: any) {
        console.log('ensureAiAnalysisLogIndexes:', e?.message);
    }
}

export async function logAiAnalysisCall(ctx: Context, entry: AiAnalysisLogEntry): Promise<void> {
    try {
        await coll(ctx).insertOne({
            time: new Date(),
            ...entry,
        });
    } catch (e: any) {
        console.log('[AiAnalysis] log failed:', e?.message);
    }
}

export async function listAiAnalysisLogs(
    ctx: Context,
    query: {
        uid?: number;
        uname?: string;
        rid?: string;
        success?: boolean;
        page?: number;
        pageSize?: number;
    } = {},
): Promise<{ docs: AiAnalysisLogDoc[]; total: number; page: number; pageSize: number; pages: number }> {
    const { page, pageSize } = clampAiAnalysisLogPage(query.page, query.pageSize);
    const filter = buildAiAnalysisLogFilter(query);

    const total = await coll(ctx).countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
    const docs = await coll(ctx)
        .find(filter)
        .sort({ time: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray() as AiAnalysisLogDoc[];
    return { docs, total, page, pageSize, pages };
}
