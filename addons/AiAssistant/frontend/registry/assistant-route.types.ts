import type { AIAssistantAdapter } from '../adapters/adapter.types';
import type { AIAssistantConfig, AssistantScene } from '../../shared/assistant-config.types';

export type AssistantEnvironmentName = 'development' | 'test' | 'production';

export interface AssistantEnvironmentConfig {
  development?: boolean;
  test?: boolean;
  production?: boolean;
}

export interface AssistantRolloutConfig {
  mode: 'all' | 'allowlist';
  resourceIds?: string[];
}

export interface AIAssistantRouteMatchConfig {
  path?: string;
  pattern?: RegExp;
  routeName?: string;
  problemIds?: string[];
  excludeProblemIds?: string[];
}

export interface AIAssistantRouteRuntime {
  pathname: string;
  search: string;
  hash: string;
  routeParams: Record<string, string | undefined>;
  locationKey?: string;
  pageData?: unknown;
}

export interface AIAssistantRouteConfig {
  id: string;
  enabled: boolean;
  match: AIAssistantRouteMatchConfig;
  scene: AssistantScene;
  assistantConfig: AIAssistantConfig;
  createAdapter: (runtime: AIAssistantRouteRuntime) => AIAssistantAdapter;
  resolveResourceId?: (runtime: AIAssistantRouteRuntime) => string | null;
  resolveConfig?: (runtime: AIAssistantRouteRuntime) => AIAssistantConfig;
  priority?: number;
  environment?: AssistantEnvironmentConfig;
  rollout?: AssistantRolloutConfig;
}

export interface AssistantRouteMatch {
  routeConfig: AIAssistantRouteConfig;
  resourceId: string;
  routeParams: Record<string, string>;
}
