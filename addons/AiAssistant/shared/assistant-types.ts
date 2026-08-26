export type AssistantMode = 'learning' | 'practice';

export type AssistantQuote = {
  type: 'text' | 'code';
  content: string;
  language?: string;
  headingPath?: string[];
  /** 正文划词引用 */
  sourceType?: 'article-selection';
  articleTitle?: string;
  sectionTitle?: string;
};

export type AssistantClientContext = {
  abbreviation: string;
  pid: string;
  mode: AssistantMode;
  /** 业务场景标识（解耦后由 adapter 注入） */
  scene?: string;
  headingId?: string;
  codeLanguage?: string;
  /** 是否启用深度思考（更长推理链，回答更慢） */
  deepThink?: boolean;
  /**
   * 是否注入「完整」静态上下文。
   * 首轮 true；追问 false 时服务端仍注入压缩题面/笔记（非空说明）。
   */
  includeStaticProblemContext?: boolean;
  /** ACM IDE 场景快照（服务端重建题面并校验权限） */
  acmSnapshot?: import('./acm/acm-assistant.types').ACMAssistantClientSnapshot;
};

export type AssistantHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AssistantStreamRequest = {
  conversationId?: string;
  question: string;
  quote?: AssistantQuote | null;
  clientContext: AssistantClientContext;
  history?: AssistantHistoryMessage[];
};

export type AssistantQuotaInfo = {
  limited: boolean;
  /** 全站剩余显示点；无限时可为 Infinity */
  remaining: number;
  quotaCenterPath?: string;
};

export type AssistantFinishReason =
  | 'completed'
  | 'cancelled'
  | 'unrelated'
  | 'quota_exceeded'
  | 'failed';

export type LocalRelevanceDecision = 'CLEARLY_UNRELATED' | 'PASS';

export type UnrelatedDecisionSource = 'local_rule' | 'model_fallback';

export type AssistantSseHtmlEvent = { type: 'html'; html: string };
export type AssistantSseDoneEvent = {
  type: 'done';
  contentHtml: string;
  /** 助手原始 Markdown，供前端历史优先使用 */
  contentMarkdown?: string;
  success: boolean;
  finishReason: AssistantFinishReason;
  quotaConsumed: boolean;
  aiQuota?: AssistantQuotaInfo;
  requestId?: string;
  unrelatedSource?: UnrelatedDecisionSource;
  conversationId?: string;
};

export type AssistantConversationListItem = {
  id: string;
  title: string;
  pid: string;
  mode: AssistantMode;
  messageCount: number;
  updatedAt: number;
};

export type AssistantConversationDetail = {
  id: string;
  abbreviation: string;
  pid: string;
  mode: AssistantMode;
  title: string;
  messages: Array<{
    role: 'user' | 'assistant';
    contentHtml: string;
    quote?: AssistantQuote | null;
    finishReason?: string;
  }>;
};

export const ASSISTANT_HISTORY_URL = '/ai-assistant/history';
export type AssistantSseErrorEvent = {
  type: 'error';
  error: string;
  code?: string;
};

export type AssistantSseEvent = AssistantSseHtmlEvent | AssistantSseDoneEvent | AssistantSseErrorEvent;

export const ASSISTANT_STREAM_URL = '/ai-assistant/stream';

export {
  UNRELATED_QUESTION_REPLY,
  ASSISTANT_OUTPUT_FORMAT_VERSION,
  ASSISTANT_THINKING_PLACEHOLDER_HTML,
} from './assistant-constants';

export const ASSISTANT_MAX_QUESTION_LEN = 2000;
export const ASSISTANT_MAX_QUOTE_LEN = 4000;
