import { Handler, param, PRIV, Types } from 'hydrooj';
import { ASSISTANT_RATE_LIMIT } from '../backend/config/assistant-rate-limit.config';
import { getStoredAssistantSettings, saveAssistantSettings } from '../lib/assistantSettings';

export class AiAssistantAdminHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    async get() {
        const stored = getStoredAssistantSettings();
        let conversationCount = 0;
        try {
            conversationCount = await this.ctx.db.collection('note_assistant_conversation').countDocuments({});
        } catch {
            conversationCount = 0;
        }
        const llmConfigured = Boolean(
            String(process.env.DEEPSEEK_API_KEY || process.env.BUILTIN_API_KEY || '').trim(),
        );
        this.response.template = 'manage_ai_assistant.html';
        this.response.body = {
            page_name: 'manage_ai_assistant',
            stored,
            rateLimit: ASSISTANT_RATE_LIMIT,
            conversationCount,
            llmConfigured,
            llmNote: '对齐 CodeFun AiQuota「大模型 API」环境变量回退：DEEPSEEK_API_KEY / BUILTIN_API_KEY。FishOJ 暂无点数钱包，助教侧仅全站开关 + 内存限频。',
        };
    }

    @param('enabled', Types.Boolean, true)
    async post(_domainId: string, _enabled?: boolean) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        const a = this.args as Record<string, unknown>;
        const enabled = a.enabled === '1' || a.enabled === true || a.enabled === 'on';
        await saveAssistantSettings({ enabled });
        this.back();
    }
}
