import { Handler, param, PRIV, Types } from 'hydrooj';
import {
    getEffectiveTutorSettings, getStoredTutorSettings, maskApiKey, saveTutorSettings,
} from '../lib/tutorSettings';

export class AiTutorAdminHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    async get() {
        const stored = getStoredTutorSettings();
        const effective = getEffectiveTutorSettings();
        this.response.template = 'manage_ai_tutor.html';
        this.response.body = {
            page_name: 'manage_ai_tutor',
            stored,
            apiKeyMasked: maskApiKey(stored.apiKey),
            apiKeySet: !!stored.apiKey,
            fromEnv: effective.fromEnv,
            effectiveModel: effective.model,
            effectiveBase: effective.base,
        };
    }

    @param('api_key', Types.String, true)
    @param('base_url', Types.String, true)
    @param('model', Types.String, true)
    async post(_domainId: string, apiKey = '', baseUrl = '', model = '') {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        await saveTutorSettings({
            apiKey,
            baseUrl,
            model,
        });
        this.back();
    }
}
