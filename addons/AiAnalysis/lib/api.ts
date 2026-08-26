/**
 * DeepSeek / OpenAI 兼容 chat 客户端（由 ai-service 移植）。
 * 其它模块请只依赖本文件导出的 aiChatClient。
 */
export {
    deepseekModel,
    resolvePlatformLlmConfig,
} from './aiChatClient';
export type {
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ChatUsage,
    PlatformLlmConfig,
    StreamCallback,
    StreamChunkMeta,
} from './aiChatClient';

import { deepseekModel } from './aiChatClient';
import type { ChatRequest, ChatResponse, StreamCallback } from './aiChatClient';

export interface AIChatClient {
    chat(req: ChatRequest): Promise<ChatResponse>;
    chatStream(req: ChatRequest, onChunk: StreamCallback): Promise<ChatResponse>;
}

export const aiChatClient: AIChatClient = {
    chat: (req) => deepseekModel.chat(req),
    chatStream: (req, onChunk) => deepseekModel.chatStream(req, onChunk),
};
