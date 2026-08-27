import type { AssistantQuote } from '../../shared/assistant-types';

export const DEFAULT_ARTICLE_FOLLOW_UPS = [
  '这段内容的核心思路是什么？',
  '能结合一个具体样例说明吗？',
  '这里有哪些常见易错点？',
];

export type ReferenceCardMode = 'composer' | 'history';

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text);
}

function metaLine(quote: AssistantQuote): string {
  const parts: string[] = [];
  if (quote.articleTitle) parts.push(quote.articleTitle);
  if (quote.sectionTitle) parts.push(quote.sectionTitle);
  return parts.join(' · ');
}

export function renderReferenceCardHtml(quote: AssistantQuote, mode: ReferenceCardMode): string {
  const meta = metaLine(quote);
  const clampClass = mode === 'composer'
    ? 'cf-assistant-ref-card__text cf-assistant-ref-card__text--composer'
    : 'cf-assistant-ref-card__text cf-assistant-ref-card__text--history';
  const removeBtn = mode === 'composer'
    ? '<button type="button" class="cf-assistant-ref-card__remove" aria-label="移除引用正文">×</button>'
    : '';
  const toggleBtn = '<button type="button" class="cf-assistant-ref-card__toggle" hidden>展开</button>';

  return `<div class="cf-assistant-ref-card" data-ref-mode="${mode}">
    ${removeBtn}
    <div class="cf-assistant-ref-card__title">引用正文</div>
    <div class="${clampClass}">${escapeHtml(quote.content)}</div>
    ${toggleBtn}
    ${meta ? `<div class="cf-assistant-ref-card__meta">${escapeHtml(meta)}</div>` : ''}
  </div>`;
}

export function wireReferenceCard(root: HTMLElement, options: {
  onRemove?: () => void;
}): void {
  const card = root.querySelector('.cf-assistant-ref-card') as HTMLElement | null;
  if (!card) return;

  const textEl = card.querySelector('.cf-assistant-ref-card__text') as HTMLElement | null;
  const toggleBtn = card.querySelector('.cf-assistant-ref-card__toggle') as HTMLButtonElement | null;
  if (textEl && toggleBtn) {
    window.requestAnimationFrame(() => {
      const overflow = textEl.scrollHeight > textEl.clientHeight + 2;
      toggleBtn.hidden = !overflow;
    });
    toggleBtn.addEventListener('click', () => {
      const expanded = card.classList.toggle('cf-assistant-ref-card--expanded');
      toggleBtn.textContent = expanded ? '收起' : '展开';
      toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      if (!expanded) {
        textEl.scrollTop = 0;
      } else {
        // 展开后若仍溢出，确保可滚；下一帧再聚焦滚动容器便于触控板操作
        window.requestAnimationFrame(() => {
          if (textEl.scrollHeight > textEl.clientHeight + 2) {
            textEl.scrollTop = 0;
          }
        });
      }
    });

    // 展开区内滚轮/触控不冒泡到外层消息列表，避免抢走滚动或触发粘底逻辑
    const stopScrollBubble = (e: Event) => {
      if (!card.classList.contains('cf-assistant-ref-card--expanded')) return;
      e.stopPropagation();
    };
    textEl.addEventListener('wheel', stopScrollBubble, { passive: true });
    textEl.addEventListener('touchmove', stopScrollBubble, { passive: true });
  }

  card.querySelector('.cf-assistant-ref-card__remove')?.addEventListener('click', () => {
    options.onRemove?.();
  });
}

export function renderFollowUpBlockHtml(questions: string[]): string {
  if (!questions.length) return '';
  const chips = questions.map((q) =>
    `<button type="button" class="cf-assistant-follow-up-question" data-q="${escapeAttr(q)}">${escapeHtml(q)}</button>`,
  ).join('');
  return `<div class="cf-assistant-follow-up">
    <div class="cf-assistant-follow-up-label">继续追问</div>
    <div class="cf-assistant-follow-up-list">${chips}</div>
  </div>`;
}
