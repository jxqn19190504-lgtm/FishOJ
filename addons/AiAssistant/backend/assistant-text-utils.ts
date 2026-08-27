import { UNRELATED_QUESTION_REPLY } from '../shared/assistant-constants';

export function normalizeQuestion(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Markdown/HTML → 纯文本，trim，统一换行（模型兜底 unrelated 精确匹配） */
export function normalizeAssistantPlainText(raw: string): string {
  let s = String(raw || '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/`([^`]+)`/g, '$1');
  s = s.replace(/\n+/g, '\n').trim();
  return s;
}

export function isExactUnrelatedReply(content: string): boolean {
  const plain = normalizeAssistantPlainText(content);
  if (plain === UNRELATED_QUESTION_REPLY) return true;
  // 允许句末标点、引号/书名号包裹，避免模型微调格式导致退款失败
  const stripped = plain
    .replace(/^[「『""'']+/, '')
    .replace(/[」』""''。.！!？?\s]+$/g, '')
    .trim();
  return stripped === UNRELATED_QUESTION_REPLY;
}

export function unrelatedReplyHtml(): string {
  return `<p>${UNRELATED_QUESTION_REPLY}</p>`;
}
