import type {
  AIAssistantConfig,
  AssistantLanguageOption,
  AssistantPageContext,
  AssistantScene,
} from '../../shared/assistant-config.types';
import type { AssistantClientContext, AssistantMode } from '../../shared/assistant-types';

/** 页面适配器：由宿主页面实现，AI 助教核心只消费标准化接口 */
export interface AIAssistantAdapter {
  getContext(): AssistantPageContext;

  getResourceId(): string;
  getScene(): AssistantScene;

  /** 构建 SSE 请求用的 clientContext（含 legacy 字段） */
  getClientContext(): AssistantClientContext;

  getCurrentLanguage?(): string;
  getSupportedLanguages?(): AssistantLanguageOption[] | string[];
  changeLanguage?(language: string): void;

  getCurrentCode?(): string;

  /** 页面是否允许展示 AI 助教（路由级：竞赛/客观题/AntiCrawl 等） */
  isAccessAllowed?(): boolean;

  /** 不可交互时的提示文案（如未登录），仍展示 UI */
  getAccessNotice?(): string | undefined;

  getSelectableRoot?(): HTMLElement | null;
  isSelectionAllowed?(range: Range): boolean;

  /** 页面模式切换（如 learning / practice） */
  getMode?(): AssistantMode;

  subscribeContextChange?(
    callback: (context: AssistantPageContext) => void,
  ): () => void;
}

export interface CreateAssistantControllerOptions {
  config: AIAssistantConfig;
  adapter: AIAssistantAdapter;
}

export type { AIAssistantConfig, AssistantPageContext, AssistantScene };
