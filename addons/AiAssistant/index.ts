import { Context } from 'hydrooj';
import {
    AssistantHistoryDetailHandler,
    AssistantHistoryListHandler,
} from './backend/AssistantHistoryHandler';
import { AssistantConversationService } from './backend/AssistantConversationService';
import { AssistantStreamHandler } from './backend/AssistantStreamHandler';
import { AcmAssistantCapabilityHandler } from './backend/AcmAssistantCapabilityHandler';
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
    bindAssistantOnProblemIde(ctx);
    console.log('[AiAssistant] FishOJ AI 助教已加载');
}
