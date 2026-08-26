/** AI 助教 — 可复用配置与页面上下文类型（前后端共享部分） */

export type AssistantScene =
  | 'hot100-note'
  | 'ide-problem'
  | 'acm-problem'
  | string;

export type AIAssistantPlacementPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'custom';

export interface AIAssistantPlacementConfig {
  position?: AIAssistantPlacementPosition;
  right?: number;
  bottom?: number;
  left?: number;
  zIndex?: number;
}

export interface AIAssistantFeatureConfig {
  chat?: boolean;
  history?: boolean;
  streaming?: boolean;
  languageSelector?: boolean;
  codeContext?: boolean;
  problemContext?: boolean;
  textSelection?: boolean;
  addToContextButton?: boolean;
  recommendedQuestions?: boolean;
  followUpQuestions?: boolean;
  deepThinking?: boolean;
  quotaDisplay?: boolean;
  autoOpenAfterSelection?: boolean;
  /** 是否允许拖动右下角入口胶囊（桌面端） */
  draggable?: boolean;
  /** 是否允许关闭（隐藏）入口胶囊 */
  dismissible?: boolean;
  /** 关闭后是否显示小圆点恢复按钮；false 时依赖宿主页面入口（如设置面板开关）恢复 */
  restoreButton?: boolean;
  /** 是否允许调整面板窗口大小（桌面端） */
  resizable?: boolean;
}

export interface AssistantProblemContext {
  problemId: string;
  title?: string;
  description?: string;
  inputFormat?: string;
  outputFormat?: string;
  constraints?: string[];
  examples?: AssistantExample[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface AssistantExample {
  input?: string;
  output?: string;
  explanation?: string;
}

export interface AssistantSelectedText {
  text: string;
  sourceType: 'article-selection' | 'problem-selection';
  sourceTitle?: string;
  sectionTitle?: string;
}

export interface AssistantPageContext {
  scene: AssistantScene;
  resourceId: string;
  title: string;

  description?: string;
  articleContent?: string;
  sectionTitle?: string;

  constraints?: string[];
  examples?: AssistantExample[];
  tags?: string[];

  language?: string;
  code?: string;

  inputFormat?: string;
  outputFormat?: string;

  selectedText?: AssistantSelectedText;

  metadata?: Record<string, unknown>;
}

export type AssistantLanguageMode = 'hidden' | 'assistant-only' | 'sync-with-editor';

export interface AIAssistantConfig {
  id: string;
  scene: AssistantScene;

  enabled: boolean;

  title?: string;
  description?: string;
  inputPlaceholder?: string;
  referenceInputPlaceholder?: string;

  features?: AIAssistantFeatureConfig;

  /** 右下角入口位置（题目页默认 bottom-right） */
  placement?: AIAssistantPlacementConfig;

  language?: {
    mode?: AssistantLanguageMode;
    defaultLanguage?: string;
    supportedLanguages?: string[];
  };

  recommendedQuestions?: string[];
  followUpQuestions?: string[];

  prompt?: {
    roleDescription?: string;
    answerRules?: string[];
    customSystemPrompt?: string;
  };

  selection?: {
    maxLength?: number;
    minLength?: number;
    selectableRootSelector?: string;
    ignoredSelectors?: string[];
    buttonText?: string;
  };

  storage?: {
    enabled?: boolean;
    namespace?: string;
  };

  ui?: {
    defaultOpen?: boolean;
    placement?: 'right' | 'left';
    width?: number | string;
  };

  /** 向后兼容：后端仍使用 abbreviation 时由 adapter 注入 */
  legacyAbbreviation?: string;
}

export interface AssistantLanguageOption {
  label: string;
  value: string;
}
