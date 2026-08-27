import type { AIAssistantConfig } from '../../shared/assistant-config.types';
import {
  codenoteAssistantIgnoredSelectors,
  noteAssistantSharedUi,
} from './shared-note-assistant-ui.config';

/** Hot100 笔记页 AI 助教配置 */
export const hot100AssistantConfig: AIAssistantConfig = {
  id: 'hot100-assistant',
  scene: 'hot100-note',
  legacyAbbreviation: 'hot100',
  enabled: true,

  ...noteAssistantSharedUi,

  selection: {
    ...noteAssistantSharedUi.selection,
    ignoredSelectors: [
      ...(noteAssistantSharedUi.selection?.ignoredSelectors || []),
      ...codenoteAssistantIgnoredSelectors,
    ],
  },

  storage: {
    enabled: true,
    namespace: 'hot100-note',
  },
};
