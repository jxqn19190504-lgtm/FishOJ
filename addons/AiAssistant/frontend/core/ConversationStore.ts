import type { AssistantHistoryMessage, AssistantQuote } from '../../shared/assistant-types';
import { slideAssistantHistoryWindow } from '../../shared/assistant-history';
import { ASSISTANT_THINKING_PLACEHOLDER_HTML } from '../../shared/assistant-constants';

export type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  contentHtml: string;
  /** 用户原始问题文本（用于停止生成时回填输入框） */
  contentText?: string;
  /** 助手原始 Markdown（优先于 HTML 剥壳，供模型历史） */
  contentMarkdown?: string;
  quote?: AssistantQuote | null;
  finishReason?: string;
  isStreaming?: boolean;
};

let msgSeq = 0;

export class ConversationStore {
  private messages: AssistantMessage[] = [];
  private sessionKey = '';
  private conversationId = '';

  reset(sessionKey: string) {
    this.sessionKey = sessionKey;
    this.messages = [];
    this.conversationId = '';
  }

  getConversationId() {
    return this.conversationId;
  }

  setConversationId(id: string | undefined) {
    this.conversationId = id ? String(id) : '';
  }

  loadConversation(
    conversationId: string,
    messages: Array<{
      role: 'user' | 'assistant';
      contentHtml: string;
      contentMarkdown?: string;
      contentPlain?: string;
      quote?: AssistantQuote | null;
      finishReason?: string;
    }>,
  ) {
    this.conversationId = conversationId;
    this.messages = messages.map((m) => ({
      id: `${m.role === 'user' ? 'u' : 'a'}-${++msgSeq}`,
      role: m.role,
      contentHtml: m.contentHtml,
      contentMarkdown: m.contentMarkdown || m.contentPlain || undefined,
      contentText: m.role === 'user' ? (m.contentPlain || m.contentMarkdown || undefined) : undefined,
      quote: m.quote || null,
      finishReason: m.finishReason,
      isStreaming: false,
    }));
  }

  getSessionKey() {
    return this.sessionKey;
  }

  getMessages() {
    return this.messages.slice();
  }

  addUserMessage(content: string, quote?: AssistantQuote | null) {
    const msg: AssistantMessage = {
      id: `u-${++msgSeq}`,
      role: 'user',
      contentHtml: escapeHtml(content),
      contentText: String(content || ''),
      quote: quote || null,
    };
    this.messages.push(msg);
    return msg;
  }

  /**
   * 停止生成时回退未完成轮次：移除末尾 streaming assistant + 对应 user。
   * 返回需回填到输入框的问题与引用。
   */
  rollbackIncompleteTurn(): { question: string; quote: AssistantQuote | null } | null {
    if (!this.messages.length) return null;
    const last = this.messages[this.messages.length - 1];
    if (last.role !== 'assistant' || !last.isStreaming) return null;

    this.messages.pop();
    let question = '';
    let quote: AssistantQuote | null = null;
    const prev = this.messages[this.messages.length - 1];
    if (prev?.role === 'user') {
      this.messages.pop();
      question = prev.contentText || stripHtml(prev.contentHtml);
      quote = prev.quote || null;
    }
    return { question, quote };
  }

  startAssistantMessage() {
    const msg: AssistantMessage = {
      id: `a-${++msgSeq}`,
      role: 'assistant',
      contentHtml: ASSISTANT_THINKING_PLACEHOLDER_HTML,
      isStreaming: true,
    };
    this.messages.push(msg);
    return msg;
  }

  updateAssistantMessage(id: string, patch: Partial<AssistantMessage>) {
    const idx = this.messages.findIndex((m) => m.id === id);
    if (idx < 0) return;
    this.messages[idx] = { ...this.messages[idx], ...patch };
  }

  /**
   * 构造请求用历史：仅已完成轮次，再经滑动窗口裁剪。
   * 当前正在发送的 user 消息（尚无完整 assistant 回复）不进入 history，
   * 避免与本次 question 重复注入、浪费额度。
   */
  getHistoryForRequest(): AssistantHistoryMessage[] {
    const completed = this.messages
      .filter((m) => !m.isStreaming && (m.contentMarkdown || m.contentText || m.contentHtml))
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        // 优先 Markdown/纯文本，避免 HTML 剥壳丢结构
        content: String(m.contentMarkdown || m.contentText || stripHtml(m.contentHtml) || '').trim(),
      }))
      .filter((m) => m.content);

    // 去掉末尾未完成轮（刚写入的当前 user 问句）
    let prior = completed;
    if (prior.length && prior[prior.length - 1].role === 'user') {
      prior = prior.slice(0, -1);
    }

    return slideAssistantHistoryWindow(prior);
  }
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripHtml(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent || el.innerText || '').trim();
}
