import type {
  AIAssistantRouteConfig,
  AIAssistantRouteRuntime,
  AssistantEnvironmentName,
  AssistantRouteMatch,
} from './assistant-route.types';

const DEV = typeof process !== 'undefined'
  ? process.env.NODE_ENV !== 'production'
  : typeof window !== 'undefined'
    && (window.location.hostname === 'localhost'
      || window.location.hostname === '127.0.0.1'
      || window.location.hostname.includes('dev'));

export function getAssistantEnvironment(): AssistantEnvironmentName {
  if (typeof window === 'undefined') return 'production';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    return 'development';
  }
  if (/test|staging|preview/i.test(host)) return 'test';
  return 'production';
}

function isRouteEnabledForEnvironment(config: AIAssistantRouteConfig): boolean {
  if (!config.environment) return true;
  const env = getAssistantEnvironment();
  const flag = config.environment[env];
  return flag !== false;
}

function pathPatternToRegExp(path: string): RegExp {
  const segments = path.split('/').filter(Boolean);
  const regexParts = segments.map((segment) => {
    if (segment.startsWith(':')) {
      const name = segment.slice(1);
      return `(?<${name}>[^/?#]+)`;
    }
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return new RegExp(`^/${regexParts.join('/')}/?$`);
}

function matchPathPattern(
  pathname: string,
  path: string,
): { matched: boolean; params: Record<string, string> } {
  const regex = pathPatternToRegExp(path);
  const match = regex.exec(pathname);
  if (!match) return { matched: false, params: {} };
  const params: Record<string, string> = {};
  if (match.groups) {
    for (const [key, value] of Object.entries(match.groups)) {
      if (value != null) params[key] = value;
    }
  }
  return { matched: true, params };
}

function matchRegexPattern(
  pathname: string,
  pattern: RegExp,
): { matched: boolean; params: Record<string, string> } {
  const match = pattern.exec(pathname);
  if (!match) return { matched: false, params: {} };
  const params: Record<string, string> = {};
  if (match.groups) {
    for (const [key, value] of Object.entries(match.groups)) {
      if (value != null) params[key] = value;
    }
  } else if (match.length > 1) {
    const keys = ['problemId', 'pid', 'abbreviation', 'resourceId'];
    for (let i = 1; i < match.length; i += 1) {
      const key = keys[i - 1] || `param${i}`;
      if (match[i]) params[key] = match[i];
    }
  }
  return { matched: true, params };
}

function getProblemIdFromParams(params: Record<string, string>): string | null {
  return params.problemId || params.pid || null;
}

function passesRollout(
  config: AIAssistantRouteConfig,
  resourceId: string | null,
): boolean {
  const rollout = config.rollout;
  if (!rollout || rollout.mode === 'all') return true;
  if (!resourceId) return false;
  const allow = rollout.resourceIds || config.match.problemIds || [];
  return allow.includes(resourceId);
}

function passesProblemFilters(
  config: AIAssistantRouteConfig,
  resourceId: string | null,
): boolean {
  const { problemIds, excludeProblemIds } = config.match;
  if (excludeProblemIds?.length && resourceId && excludeProblemIds.includes(resourceId)) {
    return false;
  }
  if (problemIds?.length) {
    if (!resourceId) return false;
    return problemIds.includes(resourceId);
  }
  return true;
}

function computeSpecificityScore(config: AIAssistantRouteConfig): number {
  let score = 0;
  if (config.match.problemIds?.length) score += 200;
  if (config.match.excludeProblemIds?.length) score += 80;
  if (config.rollout?.mode === 'allowlist') score += 150;
  if (config.match.path) score += 60 + config.match.path.length;
  if (config.match.pattern) score += 40 + config.match.pattern.source.length;
  if (config.match.routeName) score += 30;
  return score;
}

function tryMatchRoute(
  runtime: AIAssistantRouteRuntime,
  config: AIAssistantRouteConfig,
): AssistantRouteMatch | null {
  if (!config.enabled || !isRouteEnabledForEnvironment(config)) return null;

  let params: Record<string, string> = {};
  let matched = false;

  if (config.match.path) {
    const result = matchPathPattern(runtime.pathname, config.match.path);
    matched = result.matched;
    params = result.params;
  }
  if (!matched && config.match.pattern) {
    const result = matchRegexPattern(runtime.pathname, config.match.pattern);
    matched = result.matched;
    params = result.params;
  }
  if (!matched && config.match.routeName) {
    const pageName = readPageName();
    matched = pageName === config.match.routeName;
    params = { ...runtime.routeParams } as Record<string, string>;
  }
  if (!config.match.path && !config.match.pattern && !config.match.routeName) {
    return null;
  }

  if (!matched) return null;

  const mergedParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(runtime.routeParams)) {
    if (value != null) mergedParams[key] = value;
  }
  for (const [key, value] of Object.entries(params)) {
    mergedParams[key] = value;
  }

  const runtimeWithParams: AIAssistantRouteRuntime = {
    ...runtime,
    routeParams: mergedParams,
  };

  const resourceId = config.resolveResourceId?.(runtimeWithParams)
    ?? getProblemIdFromParams(mergedParams)
    ?? null;

  if (!passesProblemFilters(config, resourceId)) return null;
  if (!passesRollout(config, resourceId)) return null;
  if (!resourceId) return null;

  return {
    routeConfig: config,
    resourceId,
    routeParams: mergedParams,
  };
}

function readPageName(): string | undefined {
  const htmlPage = document.documentElement.getAttribute('data-page');
  if (htmlPage) return htmlPage;
  const el = document.querySelector('.page-layout[data-page-name]') as HTMLElement | null;
  return el?.getAttribute('data-page-name') || undefined;
}

export function matchAssistantRoute(
  runtime: AIAssistantRouteRuntime,
  registry: AIAssistantRouteConfig[],
): AssistantRouteMatch | null {
  const candidates: Array<AssistantRouteMatch & { priority: number; specificity: number }> = [];

  for (const config of registry) {
    const match = tryMatchRoute(runtime, config);
    if (!match) continue;
    candidates.push({
      ...match,
      priority: config.priority ?? 0,
      specificity: computeSpecificityScore(config),
    });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.specificity - a.specificity;
  });

  const winner = candidates[0];
  if (DEV && candidates.length > 1) {
    const conflicts = candidates.filter(
      (c) => c.routeConfig.id !== winner.routeConfig.id
        && c.priority === winner.priority
        && c.specificity === winner.specificity,
    );
    if (conflicts.length) {
      console.warn(
        '[AIAssistantHost] 多条路由配置同时匹配，已选择:',
        winner.routeConfig.id,
        '冲突:',
        conflicts.map((c) => c.routeConfig.id),
      );
    }
  }

  return {
    routeConfig: winner.routeConfig,
    resourceId: winner.resourceId,
    routeParams: winner.routeParams,
  };
}
