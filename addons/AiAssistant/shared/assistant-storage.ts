import type { AIAssistantConfig, AssistantScene } from './assistant-config.types';

const STORAGE_PREFIX = 'codefun-ai-assistant';

export function getAssistantStorageNamespace(config: Pick<AIAssistantConfig, 'id' | 'storage' | 'scene'>): string {
  return config.storage?.namespace || config.id || config.scene;
}

export function getAssistantStorageKey(params: {
  assistantId: string;
  scene: AssistantScene;
  resourceId: string;
  suffix: string;
}): string {
  return [STORAGE_PREFIX, params.assistantId, params.scene, params.resourceId, params.suffix]
    .filter(Boolean)
    .join(':');
}

export function getAssistantLanguageStorageKey(config: Pick<AIAssistantConfig, 'id' | 'storage' | 'scene'>): string {
  return `${STORAGE_PREFIX}:${getAssistantStorageNamespace(config)}:language`;
}

export function getAssistantDeepThinkStorageKey(config: Pick<AIAssistantConfig, 'id' | 'storage' | 'scene'>): string {
  return `${STORAGE_PREFIX}:${getAssistantStorageNamespace(config)}:deep-think`;
}

/** 用户拖动的入口胶囊位置（left/top） */
export function getAssistantDockPositionStorageKey(config: Pick<AIAssistantConfig, 'id' | 'storage' | 'scene'>): string {
  return `${STORAGE_PREFIX}:${getAssistantStorageNamespace(config)}:dock-position`;
}

/** 用户关闭入口胶囊的状态标记 */
export function getAssistantDismissedStorageKey(config: Pick<AIAssistantConfig, 'id' | 'storage' | 'scene'>): string {
  return `${STORAGE_PREFIX}:${getAssistantStorageNamespace(config)}:dismissed`;
}

/** 用户调整后的面板窗口尺寸（width/height） */
export function getAssistantPanelSizeStorageKey(config: Pick<AIAssistantConfig, 'id' | 'storage' | 'scene'>): string {
  return `${STORAGE_PREFIX}:${getAssistantStorageNamespace(config)}:panel-size`;
}

export function getAssistantSessionKey(params: {
  config: Pick<AIAssistantConfig, 'id' | 'scene' | 'storage'>;
  resourceId: string;
  mode?: string;
}): string {
  const ns = getAssistantStorageNamespace(params.config);
  const parts = [ns, params.config.scene, params.resourceId];
  if (params.mode) parts.push(params.mode);
  return parts.join(':');
}
