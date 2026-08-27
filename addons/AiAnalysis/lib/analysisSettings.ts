import { SystemModel } from 'hydrooj';

export const AI_ANALYSIS_DAILY_LIMIT_DEFAULT = 20;

export const ANALYSIS_SETTING_KEYS = {
    enabled: 'fishoj.aianalysis.enabled',
    dailyLimit: 'fishoj.aianalysis.daily_limit',
} as const;

function stored(key: string): string {
    try {
        return String(SystemModel.get(key) || '');
    } catch {
        return '';
    }
}

export function getStoredAnalysisSettings() {
    const rawLimit = stored(ANALYSIS_SETTING_KEYS.dailyLimit);
    const n = Number(rawLimit);
    const dailyLimit = Number.isFinite(n) && n > 0
        ? Math.floor(n)
        : AI_ANALYSIS_DAILY_LIMIT_DEFAULT;
    const rawEnabled = stored(ANALYSIS_SETTING_KEYS.enabled);
    return {
        enabled: rawEnabled !== '0' && rawEnabled !== 'false',
        dailyLimit,
    };
}

export async function saveAnalysisSettings(patch: { enabled?: boolean; dailyLimit?: number }) {
    const tasks: Array<Promise<unknown>> = [];
    if (patch.enabled != null) {
        tasks.push(SystemModel.set(ANALYSIS_SETTING_KEYS.enabled, patch.enabled ? '1' : '0'));
    }
    if (patch.dailyLimit != null) {
        const n = Math.max(1, Math.floor(Number(patch.dailyLimit) || AI_ANALYSIS_DAILY_LIMIT_DEFAULT));
        tasks.push(SystemModel.set(ANALYSIS_SETTING_KEYS.dailyLimit, String(n)));
    }
    await Promise.all(tasks);
}

export function isAnalysisEnabledFromSettings(): boolean {
    return getStoredAnalysisSettings().enabled;
}

export function configuredDailyAnalysisLimit(): number {
    return getStoredAnalysisSettings().dailyLimit;
}
