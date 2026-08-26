/** Hot100 AI 助教 — 全局业务常量（前后端共享） */

export const UNRELATED_QUESTION_REPLY = '我只可以回答算法编程、当前笔记和本站功能相关的问题哦';

/** 输出格式模板版本，用于历史消息重渲染 */
export const ASSISTANT_OUTPUT_FORMAT_VERSION = 3;

/** 流式思考阶段占位 HTML（前后端一致，不含用户可见思考正文） */
export const ASSISTANT_DEEP_THINK_KEY = 'cf_assistant_deep_think';

export const ASSISTANT_THINKING_PLACEHOLDER_HTML = [
  '<div class="cf-assistant-thinking" role="status" aria-live="polite">',
  '<span class="cf-assistant-thinking-dots" aria-hidden="true">',
  '<span class="cf-assistant-thinking-dot"></span>',
  '<span class="cf-assistant-thinking-dot"></span>',
  '<span class="cf-assistant-thinking-dot"></span>',
  '</span>',
  '<p class="cf-assistant-thinking-text">AI思考中，请稍候</p>',
  '</div>',
].join('');
