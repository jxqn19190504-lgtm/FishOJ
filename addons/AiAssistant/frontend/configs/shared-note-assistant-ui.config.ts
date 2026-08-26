import type { AIAssistantConfig } from '../../shared/assistant-config.types';

/** Hot100 / CodeNote 笔记型 AI 助教共用 UI 配置（ACM IDE 复用同一套前端） */
export const noteAssistantSharedUi: Pick<
  AIAssistantConfig,
  | 'title'
  | 'description'
  | 'inputPlaceholder'
  | 'referenceInputPlaceholder'
  | 'features'
  | 'language'
  | 'recommendedQuestions'
  | 'followUpQuestions'
  | 'selection'
> = {
  title: 'AI 助教',
  description: '针对当前笔记提问，我会结合题面与笔记内容解答。',
  inputPlaceholder: '输入问题…',
  referenceInputPlaceholder: '针对这段正文提问…',

  features: {
    languageSelector: true,
    textSelection: true,
    addToContextButton: true,
    history: true,
    followUpQuestions: true,
    deepThinking: true,
    quotaDisplay: true,
    codeContext: true,
    autoOpenAfterSelection: true,
  },

  language: {
    mode: 'sync-with-editor',
    defaultLanguage: 'cpp',
  },

  recommendedQuestions: [
    '这道题的解题思路是什么？',
    '应该使用哪种算法或数据结构？',
    '这个问题的时间复杂度是多少？',
  ],

  followUpQuestions: [
    '这段内容的核心思路是什么？',
    '能结合一个具体样例说明吗？',
    '这里有哪些常见易错点？',
  ],

  selection: {
    minLength: 2,
    maxLength: 2000,
    buttonText: '问 AI',
    ignoredSelectors: [
      '#cf-assistant-root',
      '.cf-assistant-dock',
      'input',
      'textarea',
      'select',
      'button',
      '[contenteditable="true"]',
    ],
  },
};

/** CodeNote 笔记页划词忽略区域 */
export const codenoteAssistantIgnoredSelectors = [
  '.sidebar-fixed',
  '.right-toc-shell',
  '.comment-section',
  '.doc-header',
  '.inner-scratchpad',
  '.floating-code-editor',
  '.code-editor-container',
];

/** ACM IDE 页划词忽略区域 */
export const ideAssistantIgnoredSelectors = [
  '.problem-ide-toolbar',
  '.problem-ide-right',
  '.problem-ide-run-panel',
  '.problem-ide-history',
  '.problem-ide-pset-overlay',
  '.monaco-editor',
];
