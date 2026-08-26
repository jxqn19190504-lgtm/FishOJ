import { slideAssistantHistoryWindow } from '../shared/assistant-history';
import type { AssistantHistoryMessage, AssistantQuote } from '../shared/assistant-types';
import type { BuiltAssistantContext } from './AssistantContextBuilder';
import { buildAssistantSystemPrompt } from './AssistantOutputFormatPolicy';

export function buildAssistantMessages(input: {
  ctx: BuiltAssistantContext;
  question: string;
  quote?: AssistantQuote | null;
  history?: AssistantHistoryMessage[];
  codeLanguage?: string;
  deepThink?: boolean;
}) {
  const { ctx, question, quote, history = [], codeLanguage } = input;
  const trimmedHistory = slideAssistantHistoryWindow(history);
  const system = buildAssistantSystemPrompt(ctx, question, {
    hasQuote: Boolean(quote?.content),
    hasArticleSelection: quote?.sourceType === 'article-selection',
    hasConversationHistory: trimmedHistory.length > 0,
    codeLanguage,
    deepThink: Boolean(input.deepThink),
  });

  const userParts = ['【服务端重建的页面上下文】', ctx.contextBlock];
  // 划词引用仅在用户有权阅读正文时注入，防止客户端绕过页面遮罩投喂未授权内容
  if (quote?.content && ctx.canReadStatement !== false && !ctx.isReadLimited) {
    if (quote.sourceType === 'article-selection') {
      userParts.push('', '【引用正文】', quote.content);
      if (quote.articleTitle) userParts.push('', '【所在笔记】', quote.articleTitle);
      if (quote.sectionTitle) userParts.push('', '【所在章节】', quote.sectionTitle);
      if (codeLanguage) userParts.push('', '【当前编程语言】', codeLanguage);
    } else {
      userParts.push('', '【用户引用（UX 提示，以上下文为准）】', quote.content);
      if (quote.language) userParts.push(`【引用代码语言】${quote.language}`);
    }
  }
  userParts.push('', '【用户问题】', question);

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: system },
  ];

  for (const item of trimmedHistory) {
    messages.push({ role: item.role, content: item.content });
  }

  messages.push({ role: 'user', content: userParts.join('\n') });
  return messages;
}
