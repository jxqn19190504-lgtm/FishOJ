import { Context, ObjectId } from 'hydrooj';

const COLL = 'fish_ai_analysis_cache';
export const RECORD_AI_ANALYSIS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function coll(ctx: Context) {
    return ctx.db.collection(COLL);
}

export async function ensureAiAnalysisCacheIndexes(ctx: Context) {
    try {
        await coll(ctx).createIndex(
            { recordId: 1 },
            { unique: true, name: 'fish_ai_cache_recordId' },
        );
        await coll(ctx).createIndex(
            { expiresAt: 1 },
            { expireAfterSeconds: 0, name: 'fish_ai_cache_expires_ttl' },
        );
    } catch (e: any) {
        console.log('ensureAiAnalysisCacheIndexes:', e?.message);
    }
}

export async function getAiAnalysisCacheIfValid(
    ctx: Context,
    recordId: ObjectId,
): Promise<{ contentHtml: string } | null> {
    const now = new Date();
    const doc = await coll(ctx).findOne({
        recordId,
        expiresAt: { $gt: now },
    }) as { contentHtml?: string } | null;
    if (!doc || typeof doc.contentHtml !== 'string' || !doc.contentHtml.trim()) {
        return null;
    }
    return { contentHtml: doc.contentHtml };
}

export async function setAiAnalysisCache(
    ctx: Context,
    recordId: ObjectId,
    contentHtml: string,
): Promise<void> {
    const expiresAt = new Date(Date.now() + RECORD_AI_ANALYSIS_CACHE_TTL_MS);
    await coll(ctx).updateOne(
        { recordId },
        {
            $set: {
                recordId,
                contentHtml,
                expiresAt,
                updatedAt: new Date(),
            },
        },
        { upsert: true },
    );
}
