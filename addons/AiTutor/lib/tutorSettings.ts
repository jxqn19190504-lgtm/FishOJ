import { SystemModel } from 'hydrooj';

export const TUTOR_SETTING_KEYS = {
    apiKey: 'fishoj.aitutor.api_key',
    baseUrl: 'fishoj.aitutor.base_url',
    model: 'fishoj.aitutor.model',
} as const;

export const TUTOR_SETTING_DEFAULTS = {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
};

function stored(key: string): string {
    try {
        return String(SystemModel.get(key) || '');
    } catch {
        return '';
    }
}

/** 控制面板表单：只读库里的值，不受环境变量覆盖。 */
export function getStoredTutorSettings() {
    return {
        apiKey: stored(TUTOR_SETTING_KEYS.apiKey),
        baseUrl: stored(TUTOR_SETTING_KEYS.baseUrl) || TUTOR_SETTING_DEFAULTS.baseUrl,
        model: stored(TUTOR_SETTING_KEYS.model) || TUTOR_SETTING_DEFAULTS.model,
    };
}

/**
 * 实际调用 LLM 用的配置。环境变量优先于控制面板，避免把密钥写进网页设置。
 */
export function getEffectiveTutorSettings() {
    const env = process.env;
    const saved = getStoredTutorSettings();
    const fromEnv = {
        apiKey: !!(env.FISHOJ_AI_API_KEY || env.OPENAI_API_KEY),
        baseUrl: !!env.FISHOJ_AI_BASE_URL,
        model: !!env.FISHOJ_AI_MODEL,
    };
    const key = env.FISHOJ_AI_API_KEY || env.OPENAI_API_KEY || saved.apiKey;
    const base = (env.FISHOJ_AI_BASE_URL || saved.baseUrl).replace(/\/$/, '');
    const model = env.FISHOJ_AI_MODEL || saved.model;
    const local = /localhost|127\.0\.0\.1/i.test(base);
    return { key, base, model, local, fromEnv };
}

export function maskApiKey(key: string): string {
    const s = String(key || '');
    if (!s) return '';
    if (s.length <= 4) return '****';
    return `****${s.slice(-4)}`;
}

export async function saveTutorSettings(patch: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
}) {
    const tasks: Array<Promise<unknown>> = [];
    if (patch.apiKey != null && patch.apiKey !== '') {
        tasks.push(SystemModel.set(TUTOR_SETTING_KEYS.apiKey, patch.apiKey));
    }
    if (patch.baseUrl != null) {
        const base = patch.baseUrl.trim() || TUTOR_SETTING_DEFAULTS.baseUrl;
        tasks.push(SystemModel.set(TUTOR_SETTING_KEYS.baseUrl, base.replace(/\/$/, '')));
    }
    if (patch.model != null) {
        const model = patch.model.trim() || TUTOR_SETTING_DEFAULTS.model;
        tasks.push(SystemModel.set(TUTOR_SETTING_KEYS.model, model));
    }
    await Promise.all(tasks);
}
