import { Context } from 'hydrooj';
import type { TutorEventDoc, TutorSessionDoc } from '../types';

export function sessionColl(ctx: Context) {
    return ctx.db.collection('fish_tutor_session');
}
export function eventColl(ctx: Context) {
    return ctx.db.collection('fish_tutor_event');
}

export async function getSession(ctx: Context, uid: number, domainId: string, pid: string) {
    if (!uid) return null;
    return sessionColl(ctx).findOne({ uid, domainId, pid });
}

export async function upsertSession(
    ctx: Context,
    uid: number,
    domainId: string,
    pid: string,
    patch: Partial<TutorSessionDoc>,
) {
    if (!uid) return null;
    const prev = await getSession(ctx, uid, domainId, pid);
    const next: TutorSessionDoc = {
        uid,
        domainId,
        pid,
        scaffoldLevel: patch.scaffoldLevel ?? prev?.scaffoldLevel ?? 0,
        hintLevel: patch.hintLevel ?? prev?.hintLevel ?? 0,
        hintCount: patch.hintCount ?? prev?.hintCount ?? 0,
        runCount: patch.runCount ?? prev?.runCount ?? 0,
        lastError: patch.lastError ?? prev?.lastError,
        lastCodeHash: patch.lastCodeHash ?? prev?.lastCodeHash,
        lastStatus: patch.lastStatus ?? prev?.lastStatus,
        recentHints: patch.recentHints ?? prev?.recentHints ?? [],
        completed: patch.completed ?? prev?.completed ?? false,
        updatedAt: new Date(),
    };
    await sessionColl(ctx).updateOne(
        { uid, domainId, pid },
        { $set: next },
        { upsert: true },
    );
    return next;
}

export async function addEvent(ctx: Context, doc: Omit<TutorEventDoc, 'timestamp'> & { timestamp?: Date }) {
    await eventColl(ctx).insertOne({
        ...doc,
        timestamp: doc.timestamp || new Date(),
    } as TutorEventDoc);
}
