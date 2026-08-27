/**
 * 题面在线 IDE「AI 分析」与代码笔记内嵌 IDE 共用：全站按用户一份 localStorage（API Key、模型、提示词）。
 * API Key 以 AES-GCM 加密后落盘；旧版明文 `apiKey` 字段在首次读取时自动迁移。
 * 旧版按题目分键 `problem_ide_ai_settings_${uid}_${pid}` 会在首次读取时自动迁到新键。
 */

import type { RecordAiStreamRequestOptions } from './streamClient';

export const DEFAULT_AI_MODEL = 'deepseek-v4-flash';

export const AI_MODEL_PRESETS = new Set([
    'deepseek-v4-flash',
    'kimi',
    'zhipu',
    'tongyi-qianwen',
    'doubao',
]);

export type ProblemIdeAiSettings = {
    apiKey: string;
    promptTemplate: string;
    modelPreset: string;
    customModel: string;
};

/** localStorage 落盘结构（apiKey 仅作旧版兼容，写入时不再产生） */
type StoredProblemIdeAiSettings = {
    apiKeyEnc?: string;
    apiKey?: string;
    promptTemplate?: string;
    modelPreset?: string;
    customModel?: string;
};

const API_KEY_ENC_PREFIX = 'v1';
/** 客户端派生密钥用 pepper（防 casual 读 localStorage；无法抵御同源 XSS） */
const API_KEY_PEPPER = 'fishoj.problem-ide-ai-apikey.v1';

function detectCurrentUid(): string {
    const maybeUser = (window as unknown as { UserContext?: { _id?: unknown } }).UserContext;
    const v =
        maybeUser?._id ??
        (window as unknown as { Hydro?: { user?: { _id?: unknown } } }).Hydro?.user?._id ??
        document.body.getAttribute('data-uid');
    return v == null ? 'anon' : String(v);
}

/** 全站共用：当前登录用户一份 AI 分析设置 */
export function problemIdeAiSettingsStorageKey(): string {
    return `problem_ide_ai_settings_${detectCurrentUid()}`;
}

/** @internal 旧版按题目 docId 分键，仅用于迁移 */
function legacyProblemIdeAiSettingsStorageKey(problemDocId: string): string {
    return `problem_ide_ai_settings_${detectCurrentUid()}_${problemDocId}`;
}

function bytesToB64(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]!);
    return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
}

function canUseWebCrypto(): boolean {
    return typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.getRandomValues === 'function';
}

async function deriveAesKey(uid: string): Promise<CryptoKey> {
    const material = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${API_KEY_PEPPER}:${uid}`),
    );
    return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptApiKey(plain: string, uid: string): Promise<string> {
    const text = String(plain || '');
    if (!text) return '';
    if (!canUseWebCrypto()) {
        throw new Error('当前浏览器不支持 Web Crypto，无法加密保存 API Key');
    }
    const key = await deriveAesKey(uid);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipherBuf = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(text),
    );
    return `${API_KEY_ENC_PREFIX}.${bytesToB64(iv)}.${bytesToB64(new Uint8Array(cipherBuf))}`;
}

async function decryptApiKey(blob: string, uid: string): Promise<string> {
    const raw = String(blob || '').trim();
    if (!raw) return '';
    if (!canUseWebCrypto()) return '';
    const parts = raw.split('.');
    if (parts.length !== 3 || parts[0] !== API_KEY_ENC_PREFIX) return '';
    try {
        const iv = b64ToBytes(parts[1]!);
        const data = b64ToBytes(parts[2]!);
        const key = await deriveAesKey(uid);
        const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        return new TextDecoder().decode(plainBuf);
    } catch {
        return '';
    }
}

export function defaultProblemIdeAiPromptTemplate(): string {
    // 官方题解已改由服务端拉取并按策略注入，不再经模板 {{ problem_textsol }} 传参。
    // 实际分析主路径由服务端按提交代码/IDE 代码拼装；此模板仅作兼容占位。
    return [
        '请基于以下信息进行代码评审与改进建议，使用 Markdown 输出：',
        '',
        '## 题目内容',
        '{{ problem_content }}',
        '',
        '## 提交代码',
        '{{ submit_code }}',
        '',
        '## 评测结果（含编译日志，若有）',
        '{{ judge_result }}',
    ].join('\n');
}

function normalizeParsedSettings(
    parsed: {
        apiKey?: string;
        promptTemplate?: string;
        modelPreset?: string;
        customModel?: string;
    },
    canUseCustomApiKey: boolean,
): ProblemIdeAiSettings {
    const DEFAULT_AI_PROMPT_TEMPLATE = defaultProblemIdeAiPromptTemplate();
    const normalizedModelPreset =
        typeof parsed.modelPreset === 'string' && AI_MODEL_PRESETS.has(parsed.modelPreset)
            ? parsed.modelPreset
            : DEFAULT_AI_MODEL;
    let promptTemplate = DEFAULT_AI_PROMPT_TEMPLATE;
    if (typeof parsed.promptTemplate === 'string' && parsed.promptTemplate.trim()) {
        // 清理旧版模板中的官方题解占位（已改由服务端注入）
        const cleaned = parsed.promptTemplate
            .replace(/\n*##\s*官方题解[^\n]*\n+\{\{\s*problem_textsol\s*\}\}\n*/g, '\n')
            .replace(/\{\{\s*problem_textsol\s*\}\}/g, '')
            .trim();
        promptTemplate = cleaned || DEFAULT_AI_PROMPT_TEMPLATE;
    }
    return {
        apiKey: canUseCustomApiKey && typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
        promptTemplate,
        modelPreset: canUseCustomApiKey ? normalizedModelPreset : DEFAULT_AI_MODEL,
        customModel: canUseCustomApiKey && typeof parsed.customModel === 'string' ? parsed.customModel : '',
    };
}

function defaultSettings(canUseCustomApiKey: boolean): ProblemIdeAiSettings {
    const DEFAULT_AI_PROMPT_TEMPLATE = defaultProblemIdeAiPromptTemplate();
    return {
        apiKey: '',
        promptTemplate: DEFAULT_AI_PROMPT_TEMPLATE,
        modelPreset: DEFAULT_AI_MODEL,
        customModel: '',
    };
}

async function resolveApiKeyFromStored(
    stored: StoredProblemIdeAiSettings,
    canUseCustomApiKey: boolean,
    uid: string,
): Promise<{ apiKey: string; needsReencrypt: boolean }> {
    if (!canUseCustomApiKey) return { apiKey: '', needsReencrypt: false };
    if (typeof stored.apiKeyEnc === 'string' && stored.apiKeyEnc.trim()) {
        const apiKey = await decryptApiKey(stored.apiKeyEnc, uid);
        return { apiKey, needsReencrypt: false };
    }
    if (typeof stored.apiKey === 'string' && stored.apiKey.trim()) {
        // 旧版明文：读出后由上层 rewrite 为密文
        return { apiKey: stored.apiKey, needsReencrypt: true };
    }
    return { apiKey: '', needsReencrypt: false };
}

async function parseStoredSettings(
    raw: string,
    canUseCustomApiKey: boolean,
    uid: string,
): Promise<{ settings: ProblemIdeAiSettings; needsReencrypt: boolean } | null> {
    try {
        const parsed = JSON.parse(raw) as StoredProblemIdeAiSettings;
        const { apiKey, needsReencrypt } = await resolveApiKeyFromStored(parsed, canUseCustomApiKey, uid);
        return {
            settings: normalizeParsedSettings({ ...parsed, apiKey }, canUseCustomApiKey),
            needsReencrypt,
        };
    } catch {
        return null;
    }
}

function storedHasApiKeyMaterial(raw: string | null): boolean {
    if (!raw) return false;
    try {
        const parsed = JSON.parse(raw) as StoredProblemIdeAiSettings;
        return Boolean(
            (typeof parsed.apiKeyEnc === 'string' && parsed.apiKeyEnc.trim())
            || (typeof parsed.apiKey === 'string' && parsed.apiKey.trim()),
        );
    } catch {
        return false;
    }
}

/**
 * 是否已保存自定义 API Key（不解密，供额度判断等同步场景）。
 * @param migrateFromLegacyProblemDocId 可选：全站键无数据时，再检查旧版按题目键
 */
export function hasStoredProblemIdeAiApiKey(
    canUseCustomApiKey: boolean,
    migrateFromLegacyProblemDocId?: string,
): boolean {
    if (!canUseCustomApiKey) return false;
    try {
        if (storedHasApiKeyMaterial(localStorage.getItem(problemIdeAiSettingsStorageKey()))) return true;
        const legacyId = String(migrateFromLegacyProblemDocId || '').trim();
        if (!legacyId) return false;
        return storedHasApiKeyMaterial(
            localStorage.getItem(legacyProblemIdeAiSettingsStorageKey(legacyId)),
        );
    } catch {
        return false;
    }
}

/**
 * @param canUseCustomApiKey 会员/管理员等，与题面 `UiContext.ideShortCooldown` 一致
 * @param migrateFromLegacyProblemDocId 可选：若全站键无数据，则尝试从旧键 `..._${uid}_${pid}` 读一次并写入全站键
 */
export async function readProblemIdeAiSettings(
    canUseCustomApiKey: boolean,
    migrateFromLegacyProblemDocId?: string,
): Promise<ProblemIdeAiSettings> {
    const uid = detectCurrentUid();
    const siteKey = problemIdeAiSettingsStorageKey();
    try {
        const raw = localStorage.getItem(siteKey);
        if (raw) {
            const parsed = await parseStoredSettings(raw, canUseCustomApiKey, uid);
            if (!parsed) return defaultSettings(canUseCustomApiKey);
            if (parsed.needsReencrypt && canUseCustomApiKey) {
                try {
                    await writeProblemIdeAiSettings(parsed.settings, canUseCustomApiKey);
                } catch {
                    /* 迁移失败时仍返回明文读出的设置，避免用户丢 Key */
                }
            }
            return parsed.settings;
        }
        const legacyId = String(migrateFromLegacyProblemDocId || '').trim();
        if (legacyId) {
            const legacyRaw = localStorage.getItem(legacyProblemIdeAiSettingsStorageKey(legacyId));
            if (legacyRaw) {
                const migrated = await parseStoredSettings(legacyRaw, canUseCustomApiKey, uid);
                if (migrated) {
                    try {
                        await writeProblemIdeAiSettings(migrated.settings, canUseCustomApiKey);
                        localStorage.removeItem(legacyProblemIdeAiSettingsStorageKey(legacyId));
                    } catch {
                        /* ignore */
                    }
                    return migrated.settings;
                }
            }
        }
        return defaultSettings(canUseCustomApiKey);
    } catch {
        return defaultSettings(canUseCustomApiKey);
    }
}

export async function writeProblemIdeAiSettings(
    settings: ProblemIdeAiSettings,
    canUseCustomApiKey: boolean,
): Promise<void> {
    const uid = detectCurrentUid();
    const DEFAULT_AI_PROMPT_TEMPLATE = defaultProblemIdeAiPromptTemplate();
    const safePreset = AI_MODEL_PRESETS.has(settings.modelPreset) ? settings.modelPreset : DEFAULT_AI_MODEL;
    const plainKey = canUseCustomApiKey ? String(settings.apiKey || '') : '';
    const apiKeyEnc = plainKey ? await encryptApiKey(plainKey, uid) : '';
    const payload: StoredProblemIdeAiSettings = {
        apiKeyEnc,
        promptTemplate: settings.promptTemplate?.trim() ? settings.promptTemplate : DEFAULT_AI_PROMPT_TEMPLATE,
        modelPreset: canUseCustomApiKey ? safePreset : DEFAULT_AI_MODEL,
        customModel: canUseCustomApiKey ? settings.customModel : '',
    };
    localStorage.setItem(problemIdeAiSettingsStorageKey(), JSON.stringify(payload));
}

export function resolveProblemIdeAiModelName(settings: ProblemIdeAiSettings, canUseCustomApiKey: boolean): string {
    if (!canUseCustomApiKey) return DEFAULT_AI_MODEL;
    const customModel = String(settings.customModel || '').trim();
    if (customModel) return customModel;
    return settings.modelPreset || DEFAULT_AI_MODEL;
}

export function resolveProblemIdeAiProvider(
    settings: ProblemIdeAiSettings,
): 'deepseek' | 'kimi' | 'zhipu' | 'tongyi-qianwen' | 'doubao' {
    switch (settings.modelPreset) {
        case 'kimi':
        case 'zhipu':
        case 'tongyi-qianwen':
        case 'doubao':
            return settings.modelPreset;
        case 'deepseek-v4-flash':
        default:
            return 'deepseek';
    }
}

export type RecordAiIdeStreamPick = Pick<
    RecordAiStreamRequestOptions,
    'apiKey' | 'provider' | 'model' | 'promptTemplate'
>;

/**
 * 与题面 IDE「开始 AI 分析」请求体对齐的字段（不含 signal / promptVars / disableCache）。
 */
export function recordAiStreamRequestOptionsFromSavedSettings(
    settings: ProblemIdeAiSettings,
    canUseCustomApiKey: boolean,
): RecordAiIdeStreamPick {
    const promptTemplate =
        typeof settings.promptTemplate === 'string' && settings.promptTemplate.trim()
            ? settings.promptTemplate
            : defaultProblemIdeAiPromptTemplate();
    const provider = resolveProblemIdeAiProvider(settings);
    const model = resolveProblemIdeAiModelName(settings, canUseCustomApiKey);
    const apiKey =
        canUseCustomApiKey && (settings.apiKey || '').trim() ? settings.apiKey : undefined;
    return {
        apiKey,
        /**
         * 始终显式携带 provider/model，避免未保存设置或非会员路径下依赖服务端默认值漂移。
         * - 非会员/不可自定义时：固定 deepseek + deepseek-v4-flash
         * - 可自定义时：沿用用户设置（含 customModel）
         */
        provider,
        model,
        promptTemplate,
    };
}

/**
 * 从全站用户设置组装流式请求字段。
 * @param migrateFromLegacyProblemDocId 可选，用于从旧版「按题目」存储迁移（见 {@link readProblemIdeAiSettings}）
 */
export async function recordAiStreamRequestOptionsFromProblemIdeSettings(
    canUseCustomApiKey: boolean,
    migrateFromLegacyProblemDocId?: string,
): Promise<RecordAiIdeStreamPick> {
    return recordAiStreamRequestOptionsFromSavedSettings(
        await readProblemIdeAiSettings(canUseCustomApiKey, migrateFromLegacyProblemDocId),
        canUseCustomApiKey,
    );
}
