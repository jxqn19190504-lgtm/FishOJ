import { SystemModel } from 'hydrooj';

export const ASSISTANT_SETTING_KEYS = {
    enabled: 'fishoj.aiassistant.enabled',
} as const;

function stored(key: string): string {
    try {
        return String(SystemModel.get(key) || '');
    } catch {
        return '';
    }
}

export function getStoredAssistantSettings() {
    const raw = stored(ASSISTANT_SETTING_KEYS.enabled);
    return {
        /** 未写入或为空时默认开启 */
        enabled: raw !== '0' && raw !== 'false',
    };
}

export async function saveAssistantSettings(patch: { enabled?: boolean }) {
    if (patch.enabled != null) {
        await SystemModel.set(ASSISTANT_SETTING_KEYS.enabled, patch.enabled ? '1' : '0');
    }
}

export function isAssistantEnabledFromSettings(): boolean {
    return getStoredAssistantSettings().enabled;
}
