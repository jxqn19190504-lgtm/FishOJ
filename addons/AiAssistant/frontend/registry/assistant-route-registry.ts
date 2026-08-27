import { acmProblemAssistantRoute } from './routes/ide-problem.route';
import type { AIAssistantRouteConfig } from './assistant-route.types';
import { validateAssistantRouteRegistry } from './assistant-route-validator';

/** FishOJ：仅挂载 ProblemIde（/ide/:pid）ACM 助教路由 */
export const assistantRouteRegistry: AIAssistantRouteConfig[] = [
  acmProblemAssistantRoute,
];

validateAssistantRouteRegistry(assistantRouteRegistry);

export { acmProblemAssistantRoute } from './routes/ide-problem.route';
