import { Context, PRIV } from 'hydrooj';
import {
    AssistantHistoryDetailHandler,
    AssistantHistoryListHandler,
} from './backend/AssistantHistoryHandler';
import { AssistantConversationService } from './backend/AssistantConversationService';
import { AssistantStreamHandler } from './backend/AssistantStreamHandler';
import { AcmAssistantCapabilityHandler } from './backend/AcmAssistantCapabilityHandler';
import { AiAssistantAdminHandler } from './handler/assistantAdmin';
import { bindAssistantOnProblemIde } from './hooks/problemIde';

export async function apply(ctx: Context) {
    await AssistantConversationService.ensureIndexes();
    ctx.Route('fish_ai_assistant_stream', '/ai-assistant/stream', AssistantStreamHandler);
    ctx.Route(
        'fish_ai_assistant_acm_capability',
        '/ai-assistant/acm/capability',
        AcmAssistantCapabilityHandler,
    );
    ctx.Route('fish_ai_assistant_history', '/ai-assistant/history', AssistantHistoryListHandler);
    ctx.Route(
        'fish_ai_assistant_history_detail',
        '/ai-assistant/history/:id',
        AssistantHistoryDetailHandler,
    );
    ctx.Route('manage_ai_assistant', '/manage/ai-assistant', AiAssistantAdminHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.injectUI('ControlPanel', 'manage_ai_assistant', { icon: 'comment', after: 'manage_ai_tutor' }, PRIV.PRIV_EDIT_SYSTEM);
    ctx.i18n.load('zh', { manage_ai_assistant: 'AI 助教管理' });
    ctx.i18n.load('en', { manage_ai_assistant: 'AI Assistant' });
    bindAssistantOnProblemIde(ctx);
    console.log('[AiAssistant] FishOJ AI 助教已加载');
}
