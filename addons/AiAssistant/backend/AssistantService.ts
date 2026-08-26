import { PassThrough } from 'stream';
import { SystemModel } from 'hydrooj';
import { aiChatClient, type ChatRequest } from '../lib/api';
import { renderMdSafe } from '../lib/markdown';
import {
  type AssistantFinishReason,
  type AssistantQuotaInfo,
  type AssistantStreamRequest,
  type UnrelatedDecisionSource,
} from '../shared/assistant-types';
import { UNRELATED_QUESTION_REPLY } from '../shared/assistant-constants';
import { buildAcmAssistantContext } from './AcmAssistantContextBuilder';
import { buildAcmAssistantMessages } from './AcmAssistantPromptBuilder';
import { AssistantLocalRelevanceGuard } from './AssistantLocalRelevanceGuard';
import { AssistantConversationService } from './AssistantConversationService';
import { isExactUnrelatedReply, unrelatedReplyHtml } from './assistant-text-utils';
import {
  assistantThinkingPlaceholderHtml,
  resolveAssistantStreamMarkdown,
  stripAssistantThinkingTags,
} from './assistant-stream-content';

const STREAM_HTML_EMIT_MS = 120;
const relevanceGuard = new AssistantLocalRelevanceGuard();

export function sseWrite(stream: PassThrough, payload: Record<string, unknown>): void {
  if (stream.writableEnded || stream.destroyed) return;
  stream.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function streamFixedUnrelatedReply(input: {
  stream: PassThrough;
  quotaConsumed: boolean;
  unrelatedSource: UnrelatedDecisionSource;
  aiQuota?: AssistantQuotaInfo;
  requestId: string;
  persist?: {
    domainId: string;
    uid: number;
    request: AssistantStreamRequest;
  };
}) {
  const html = unrelatedReplyHtml();
  sseWrite(input.stream, { type: 'html', html });

  let conversationId: string | undefined;
  if (input.persist) {
    try {
      const saved = await AssistantConversationService.appendTurn({
        domainId: input.persist.domainId,
        uid: input.persist.uid,
        conversationId: input.persist.request.conversationId,
        clientContext: input.persist.request.clientContext,
        userQuestion: input.persist.request.question,
        userQuote: input.persist.request.quote,
        assistantContentHtml: html,
        assistantContentMarkdown: UNRELATED_QUESTION_REPLY,
        finishReason: 'unrelated',
      });
      conversationId = saved.conversationId;
    } catch (e: any) {
      console.log('[AiAssistant] persist unrelated turn failed:', e?.message);
    }
  }

  sseWrite(input.stream, {
    type: 'done',
    contentHtml: html,
    contentMarkdown: UNRELATED_QUESTION_REPLY,
    success: true,
    finishReason: 'unrelated',
    quotaConsumed: input.quotaConsumed,
    unrelatedSource: input.unrelatedSource,
    requestId: input.requestId,
    conversationId,
    ...(input.aiQuota ? { aiQuota: input.aiQuota } : {}),
  });
  input.stream.end();
}

export async function isAssistantGloballyEnabled(): Promise<boolean> {
  try {
    const raw = await SystemModel.get('fishoj.aiassistant.enabled');
    return raw !== '0' && raw !== false;
  } catch {
    return true;
  }
}

function isClientAbortError(e: any): boolean {
  return e?.code === 'CLIENT_ABORTED'
    || e?.name === 'AbortError'
    || String(e?.message || '') === 'CLIENT_ABORTED';
}

/**
 * FishOJ：仅支持 acm-problem / ide-problem；无 AiQuota，走 DEEPSEEK_API_KEY / BUILTIN_API_KEY。
 */
export async function runAssistantStream(input: {
  domainId: string;
  user: any;
  request: AssistantStreamRequest;
  stream: PassThrough;
  requestId: string;
  clientAbortSignal?: AbortSignal;
  onLocalUnrelatedHit?: (uid: number) => void;
}) {
  const uid = Number(input.user?._id || 0);
  if (!uid) throw Object.assign(new Error('请先登录后再使用 AI 助教'), { code: 'UNAUTHORIZED' });

  if (!(await isAssistantGloballyEnabled())) {
    throw Object.assign(new Error('AI 助教功能暂未开放'), { code: 'DISABLED' });
  }

  const scene = String(input.request.clientContext.scene || '').trim();
  const isAcmScene = scene === 'acm-problem' || scene === 'ide-problem';
  if (!isAcmScene) {
    throw Object.assign(new Error('当前页面暂未开放 AI 助教'), { code: 'SCENE_UNSUPPORTED' });
  }

  const history = await AssistantConversationService.getHistoryForModel({
    domainId: input.domainId,
    uid,
    conversationId: input.request.conversationId,
    abbreviation: input.request.clientContext.abbreviation,
    pid: input.request.clientContext.pid,
    clientHistory: input.request.history,
  });
  const hasHistory = history.length > 0;
  const includeStaticProblemContext = !hasHistory
    || input.request.clientContext.includeStaticProblemContext === true;

  const acmCtx = await buildAcmAssistantContext({
    domainId: input.domainId,
    viewerUid: uid,
    pid: input.request.clientContext.pid,
    snapshot: input.request.clientContext.acmSnapshot,
    codeLanguage: input.request.clientContext.codeLanguage,
    includeStaticProblemContext,
  });

  const local = relevanceGuard.check({
    question: input.request.question,
    hasQuote: Boolean(input.request.quote?.content),
    hasConversationHistory: hasHistory,
  });

  if (local.decision === 'CLEARLY_UNRELATED') {
    input.onLocalUnrelatedHit?.(uid);
    await streamFixedUnrelatedReply({
      stream: input.stream,
      quotaConsumed: false,
      unrelatedSource: 'local_rule',
      requestId: input.requestId,
      persist: {
        domainId: input.domainId,
        uid,
        request: input.request,
      },
    });
    return;
  }

  const messages = buildAcmAssistantMessages({
    ctx: acmCtx,
    question: input.request.question,
    quote: input.request.quote,
    history,
    codeLanguage: input.request.clientContext.codeLanguage,
    deepThink: Boolean(input.request.clientContext.deepThink),
  });

  const deepThink = Boolean(input.request.clientContext.deepThink);
  const aiQuotaInfo: AssistantQuotaInfo = {
    limited: false,
    remaining: 0,
  };

  const chatReq: ChatRequest = {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    messages,
    temperature: 0.35,
    max_tokens: 4096,
    excludeReasoningFromStream: true,
    thinking: deepThink ? { type: 'enabled' } : { type: 'disabled' },
    ...(deepThink ? { reasoning_effort: 'max' as const } : {}),
    ...(input.clientAbortSignal ? { abortSignal: input.clientAbortSignal } : {}),
  };

  let fullMd = '';
  let lastHtmlEmit = Date.now() - STREAM_HTML_EMIT_MS;
  let lastEmittedHtml = '';
  try {
    await aiChatClient.chatStream(chatReq, async (_delta: string, full: string, meta) => {
      if (input.clientAbortSignal?.aborted || input.stream.destroyed || input.stream.writableEnded) {
        throw Object.assign(new Error('CLIENT_ABORTED'), { code: 'CLIENT_ABORTED', name: 'AbortError' });
      }
      fullMd = full;
      const resolved = resolveAssistantStreamMarkdown(full);
      const inReasoningOnly = Boolean(
        meta?.hasReasoningDelta && !meta?.hasContentDelta && !resolved.markdown.trim(),
      );
      let html = '';
      if (resolved.phase === 'thinking' || inReasoningOnly) {
        html = assistantThinkingPlaceholderHtml(deepThink);
      } else if (String(resolved.markdown || '').trim()) {
        html = renderMdSafe(resolved.markdown);
      }
      if (!html || html === lastEmittedHtml) return;

      const now = Date.now();
      if (now - lastHtmlEmit < STREAM_HTML_EMIT_MS) return;
      lastHtmlEmit = now;
      lastEmittedHtml = html;
      sseWrite(input.stream, { type: 'html', html });
    });

    const raw = stripAssistantThinkingTags(fullMd.trim());
    if (!raw) throw new Error('AI 返回为空，请稍后重试');

    let finishReason: AssistantFinishReason = 'completed';
    let unrelatedSource: UnrelatedDecisionSource | undefined;
    if (isExactUnrelatedReply(raw)) {
      finishReason = 'unrelated';
      unrelatedSource = 'model_fallback';
      input.onLocalUnrelatedHit?.(uid);
    }

    const contentHtml = finishReason === 'unrelated'
      ? unrelatedReplyHtml()
      : renderMdSafe(raw);

    let conversationId: string | undefined;
    try {
      const saved = await AssistantConversationService.appendTurn({
        domainId: input.domainId,
        uid,
        conversationId: input.request.conversationId,
        clientContext: input.request.clientContext,
        userQuestion: input.request.question,
        userQuote: input.request.quote,
        assistantContentHtml: contentHtml,
        assistantContentMarkdown: finishReason === 'unrelated' ? UNRELATED_QUESTION_REPLY : raw,
        finishReason,
      });
      conversationId = saved.conversationId;
    } catch (e: any) {
      console.log('[AiAssistant] persist turn failed:', e?.message);
    }

    const contentMarkdown = finishReason === 'unrelated' ? UNRELATED_QUESTION_REPLY : raw;
    sseWrite(input.stream, {
      type: 'done',
      contentHtml,
      contentMarkdown,
      success: true,
      finishReason,
      quotaConsumed: false,
      unrelatedSource,
      requestId: input.requestId,
      conversationId,
      aiQuota: aiQuotaInfo,
    });
  } catch (e: any) {
    const clientAborted = isClientAbortError(e) || Boolean(input.clientAbortSignal?.aborted);
    if (!clientAborted) {
      sseWrite(input.stream, {
        type: 'error',
        error: e?.message || 'AI 助教请求失败，请稍后重试',
        code: e?.code || 'FAILED',
      });
    }
  } finally {
    if (!input.stream.writableEnded && !input.stream.destroyed) {
      input.stream.end();
    }
  }
}

export { UNRELATED_QUESTION_REPLY };
