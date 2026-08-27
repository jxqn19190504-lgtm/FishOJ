import { ASSISTANT_THINKING_PLACEHOLDER_HTML } from '../shared/assistant-constants';

/** 避免字面量被工具链改写，统一用拼接构造标签名 */
const REDACTED_THINK_TAG = ['redacted', 'thinking'].join('_');
const THINK_TAG = 'think';

const THINK_TAG_PATTERNS = [
  new RegExp(`<${REDACTED_THINK_TAG}>[\\s\\S]*?<\\/${REDACTED_THINK_TAG}>`, 'gi'),
  new RegExp(`<${THINK_TAG}(?:ing)?>[\\s\\S]*?<\\/${THINK_TAG}(?:ing)?>`, 'gi'),
  /<analysis>[\s\S]*?<\/analysis>/gi,
  /\[analysis\][\s\S]*?\[\/analysis\]/gi,
  /【思考(?:过程)?】[\s\S]*?(?:【回答】\s*|$)/gi,
  /##\s*思考过程\s*\n[\s\S]*?(?=##\s|\n*$)/gi,
];

/** 未闭合时视为仍在思考阶段，不把内容刷给用户 */
const THINK_OPEN_RE = new RegExp(
  `<(?:${REDACTED_THINK_TAG}|${THINK_TAG}(?:ing)?|analysis)>|\\[analysis\\]|【思考(?:过程)?】`,
  'i',
);
const THINK_CLOSE_RE = new RegExp(
  `<\\/(?:${REDACTED_THINK_TAG}|${THINK_TAG}(?:ing)?|analysis)>|\\[\\/analysis\\]|【回答】`,
  'i',
);

export function stripAssistantThinkingTags(raw: string): string {
  let s = String(raw || '');
  for (const pattern of THINK_TAG_PATTERNS) {
    s = s.replace(pattern, '');
  }
  // 若仍残留未闭合思考标签，整段丢弃到闭合点或全部丢弃
  const openIdx = s.search(THINK_OPEN_RE);
  if (openIdx >= 0) {
    const tail = s.slice(openIdx);
    const closeMatch = tail.match(THINK_CLOSE_RE);
    if (!closeMatch || closeMatch.index == null) {
      s = s.slice(0, openIdx);
    } else {
      s = s.slice(0, openIdx) + tail.slice(closeMatch.index + closeMatch[0].length);
    }
  }
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

export function resolveAssistantStreamMarkdown(raw: string): {
  phase: 'thinking' | 'answer';
  markdown: string;
} {
  const s = String(raw || '');
  if (!s.trim()) {
    return { phase: 'thinking', markdown: '' };
  }

  const openIdx = s.search(THINK_OPEN_RE);
  if (openIdx >= 0) {
    const tail = s.slice(openIdx);
    if (!THINK_CLOSE_RE.test(tail)) {
      return { phase: 'thinking', markdown: '' };
    }
  }

  const markdown = stripAssistantThinkingTags(s);
  if (!markdown.trim()) {
    return { phase: 'thinking', markdown: '' };
  }
  return { phase: 'answer', markdown };
}

export function assistantThinkingPlaceholderHtml(deepThink = false): string {
  const text = deepThink ? '深度思考中，请稍候' : 'AI思考中，请稍候';
  return ASSISTANT_THINKING_PLACEHOLDER_HTML.replace('AI思考中，请稍候', text);
}
