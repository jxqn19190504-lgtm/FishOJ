import { SystemModel } from 'hydrooj';

export const SOLUTION_SETTING_KEYS = {
    publisherUids: 'fishoj.solution.publisher_uids',
} as const;

/** 官方题解发布者 UID，与 CodeFun ADMINSOL_UIDS / getOfficialSolutionPublishers 对齐 */
export const DEFAULT_PUBLISHER_UIDS = [2];

function stored(key: string): string {
    try {
        return String(SystemModel.get(key) || '');
    } catch {
        return '';
    }
}

export function getPublisherUids(): number[] {
    const raw = stored(SOLUTION_SETTING_KEYS.publisherUids);
    if (!raw.trim()) return [...DEFAULT_PUBLISHER_UIDS];
    const uids = raw.split(/[\n,;]+/)
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    return uids.length ? uids : [...DEFAULT_PUBLISHER_UIDS];
}

export async function savePublisherUids(uids: number[]) {
    const cleaned = uids.filter((n) => Number.isFinite(n) && n > 0);
    await SystemModel.set(
        SOLUTION_SETTING_KEYS.publisherUids,
        (cleaned.length ? cleaned : DEFAULT_PUBLISHER_UIDS).join('\n'),
    );
}
