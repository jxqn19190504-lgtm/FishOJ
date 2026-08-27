import { acmAssistantConfig } from '../../configs/acm.config';
import { createAcmProblemAssistantAdapter } from '../../adapters/acm-problem/acm-problem.adapter';
import type { AIAssistantRouteConfig } from '../assistant-route.types';

/**
 * ACM IDE 题目页 AI 助教路由（/ide/:pid）。
 * 复用同一套 AIAssistantHost + acm-problem adapter。
 */
export const acmProblemAssistantRoute: AIAssistantRouteConfig = {
  id: 'acm-problem-route',
  enabled: true,
  priority: 110,

  match: {
    pattern: /^\/ide\/(?<problemId>[^/?#]+)$/,
    routeName: 'problem_ide',
  },

  scene: 'acm-problem',
  assistantConfig: acmAssistantConfig,

  rollout: {
    mode: 'all',
  },

  environment: {
    development: true,
    test: true,
    production: true,
  },

  resolveResourceId: (runtime) => runtime.routeParams.problemId ?? null,

  resolveConfig: () => acmAssistantConfig,

  createAdapter: (runtime) => {
    const problemId = runtime.routeParams.problemId;
    if (!problemId) {
      throw new Error('[acm-problem-route] 缺少 problemId');
    }
    return createAcmProblemAssistantAdapter({ problemId });
  },
};
