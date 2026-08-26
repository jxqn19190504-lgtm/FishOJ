import type { AssistantMessage } from '../core/ConversationStore';
import { enhanceAssistantMessageBody } from '../core/AssistantMessageEnhancer';
import { ensureAssistantStreamMount, patchAssistantStreamHtml } from '../core/AssistantStreamDom';
import { AssistantStickToBottom } from '../core/AssistantStickToBottom';
import {
  DEFAULT_ARTICLE_FOLLOW_UPS,
  renderFollowUpBlockHtml,
  renderReferenceCardHtml,
  wireReferenceCard,
} from './AssistantReferenceCard';

export type AssistantMessageListOptions = {
  onFollowUpClick?: (question: string) => void;
  shouldShowFollowUp?: (msg: AssistantMessage, index: number, messages: AssistantMessage[]) => boolean;
  getFollowUpQuestions?: (msg: AssistantMessage) => string[];
  /** 粘底状态变化（用于「回到底部」按钮） */
  onStickPinnedChange?: (pinned: boolean) => void;
};

export class AssistantMessageList {
  private root: HTMLElement;
  private lastStreamHtml = new Map<string, string>();
  private options: AssistantMessageListOptions;
  private stick: AssistantStickToBottom;

  constructor(root: HTMLElement, options: AssistantMessageListOptions = {}) {
    this.root = root;
    this.options = options;
    this.stick = new AssistantStickToBottom(root, {
      onPinnedChange: (pinned) => this.options.onStickPinnedChange?.(pinned),
    });
  }

  dispose() {
    this.stick.dispose();
  }

  /** 发新消息前调用：重新贴底并滚到最新 */
  pinToBottom() {
    this.stick.pinAndScrollToBottom();
  }

  isPinnedToBottom() {
    return this.stick.isPinned();
  }

  render(messages: AssistantMessage[], opts?: { forcePin?: boolean }) {
    const wasPinned = this.stick.isPinned();
    const prevTop = this.root.scrollTop;
    this.lastStreamHtml.clear();
    this.root.innerHTML = messages.map((m, i) => this.renderMessage(m, i, messages)).join('');
    this.wireInteractiveCards();
    // 整表 innerHTML 会拆掉已挂载的 code-switcher；必须重新 enhance 全部历史消息，
    // 否则只渲染「当前」气泡时上一块 IDE 代码块会消失。
    this.enhanceAllAssistantMessages();
    if (opts?.forcePin || wasPinned) {
      this.stick.pinAndScrollToBottom();
    } else {
      // 用户已上滑：重建 DOM 后恢复视口，避免流式结束整表重绘时跳动
      this.root.scrollTop = prevTop;
    }
  }

  updateStreamingHtml(id: string, html: string) {
    const msgEl = this.root.querySelector(`[data-msg-id="${id}"]`) as HTMLElement | null;
    const body = msgEl?.querySelector('.cf-assistant-msg-body') as HTMLElement | null;
    if (!body) return;

    if (this.lastStreamHtml.get(id) === html) return;
    this.lastStreamHtml.set(id, html);

    msgEl?.classList.add('cf-assistant-msg--streaming');
    body.classList.add('is-streaming');

    const mount = ensureAssistantStreamMount(body);
    patchAssistantStreamHtml(mount, html, this.stick);
  }

  finalizeStreamingMessage(id: string, html: string) {
    const msgEl = this.root.querySelector(`[data-msg-id="${id}"]`) as HTMLElement | null;
    const body = msgEl?.querySelector('.cf-assistant-msg-body') as HTMLElement | null;
    if (!body) return;

    msgEl?.classList.remove('cf-assistant-msg--streaming');
    body.classList.remove('is-streaming');

    if (this.lastStreamHtml.get(id) !== html) {
      this.lastStreamHtml.set(id, html);
      const mount = ensureAssistantStreamMount(body);
      patchAssistantStreamHtml(mount, html, this.stick);
    } else {
      this.stick.afterContentMutation();
    }
  }

  enhanceAssistantMessage(id: string) {
    const el = this.root.querySelector(`[data-msg-id="${id}"] .cf-assistant-msg-body`) as HTMLElement | null;
    if (el) enhanceAssistantMessageBody(el);
  }

  enhanceAllAssistantMessages() {
    this.root.querySelectorAll('.cf-assistant-msg--assistant .cf-assistant-msg-body').forEach((el) => {
      const body = el as HTMLElement;
      // 流式中的消息由 updateStreamingHtml 整段替换，此时 enhance 会被冲掉且无意义
      if (body.classList.contains('is-streaming')) return;
      enhanceAssistantMessageBody(body);
    });
  }

  private wireInteractiveCards() {
    this.root.querySelectorAll('.cf-assistant-ref-card[data-ref-mode="history"]').forEach((card) => {
      wireReferenceCard(card.parentElement as HTMLElement, {});
    });

    this.root.querySelectorAll('.cf-assistant-follow-up-question').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = (btn as HTMLElement).getAttribute('data-q') || '';
        if (q) this.options.onFollowUpClick?.(q);
      });
    });
  }

  private renderQuoteBlock(m: AssistantMessage): string {
    if (!m.quote?.content) return '';
    if (m.quote.sourceType === 'article-selection') {
      return renderReferenceCardHtml(m.quote, 'history');
    }
    return `<div class="cf-assistant-quote">${escapeHtml(m.quote.content.slice(0, 200))}</div>`;
  }

  private renderFollowUp(m: AssistantMessage, index: number, messages: AssistantMessage[]): string {
    if (m.role !== 'assistant' || m.isStreaming) return '';
    if (!this.options.shouldShowFollowUp?.(m, index, messages)) return '';
    const questions = this.options.getFollowUpQuestions?.(m) || DEFAULT_ARTICLE_FOLLOW_UPS;
    return renderFollowUpBlockHtml(questions);
  }

  private renderMessage(m: AssistantMessage, index: number, messages: AssistantMessage[]): string {
    const streamingClass = m.isStreaming ? ' cf-assistant-msg--streaming' : '';
    const quote = this.renderQuoteBlock(m);
    const followUp = this.renderFollowUp(m, index, messages);
    const body = m.role === 'assistant'
      ? this.renderAssistantBody(m)
      : `<div class="cf-assistant-msg-body">${m.contentHtml}</div>`;

    if (m.role === 'user') {
      return `<div class="cf-assistant-msg cf-assistant-msg--user" data-msg-id="${m.id}">
        <div class="cf-assistant-msg-row cf-assistant-msg-row--user">
          <div class="cf-assistant-msg-content">
            ${quote}
            ${body}
          </div>
          <div class="cf-assistant-avatar cf-assistant-avatar--user" aria-hidden="true">
            <i class="fas fa-user"></i>
          </div>
        </div>
      </div>`;
    }

    return `<div class="cf-assistant-msg cf-assistant-msg--assistant${streamingClass}" data-msg-id="${m.id}">
      <div class="cf-assistant-msg-row cf-assistant-msg-row--assistant">
        <div class="cf-assistant-avatar cf-assistant-avatar--bot" aria-hidden="true">
          <i class="fas fa-robot"></i>
        </div>
        <div class="cf-assistant-msg-content">
          ${body}
          ${followUp}
        </div>
      </div>
    </div>`;
  }

  private renderAssistantBody(m: AssistantMessage): string {
    const bodyClass = m.isStreaming
      ? 'cf-assistant-msg-body cf-assistant-md is-streaming'
      : 'cf-assistant-msg-body cf-assistant-md';
    return `<div class="${bodyClass}"><div class="cf-assistant-msg-stream-root">${m.contentHtml}</div></div>`;
  }
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
