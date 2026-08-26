import type { AIAssistantConfig } from '../../shared/assistant-config.types';
import {
  ideAssistantIgnoredSelectors,
  noteAssistantSharedUi,
} from './shared-note-assistant-ui.config';

/** ACM IDE 题目页 AI 助教：前端 UI 与 Hot100 笔记页保持一致 */
export const acmAssistantConfig: AIAssistantConfig = {
  id: 'acm-assistant',
  scene: 'acm-problem',
  legacyAbbreviation: 'acm',
  enabled: true,

  ...noteAssistantSharedUi,

  /** IDE 场景关闭胶囊后由右上角设置面板开关恢复，不显示小圆点 */
  features: {
    ...noteAssistantSharedUi.features,
    restoreButton: false,
  },

  selection: {
    ...noteAssistantSharedUi.selection,
    ignoredSelectors: [
      ...(noteAssistantSharedUi.selection?.ignoredSelectors || []),
      ...ideAssistantIgnoredSelectors,
    ],
  },

  prompt: {
    answerRules: [
      '严格结合输入输出格式和数据范围',
      '分析时间复杂度与空间复杂度',
      '排查问题时区分编译错误、运行错误、超时和答案错误',
      '结合本人最近提交状态、评测反馈与运行日志分析，不得臆造评测细节',
    ],
  },

  storage: {
    enabled: true,
    namespace: 'acm-problem',
  },
};
