/**
 * assistant-route-matcher 单元测试
 * 运行：npx ts-node --transpile-only frontend/registry/assistant-route-matcher.test.ts
 */
import assert from 'assert';
import { matchAssistantRoute } from './assistant-route-matcher';
import type { AIAssistantRouteConfig, AIAssistantRouteRuntime } from './assistant-route.types';
import { acmAssistantConfig } from '../configs/acm.config';

function runtime(pathname: string, extra: Partial<AIAssistantRouteRuntime> = {}): AIAssistantRouteRuntime {
  return {
    pathname,
    search: '',
    hash: '',
    routeParams: {},
    ...extra,
  };
}

function makeIdeRoute(overrides: Partial<AIAssistantRouteConfig> = {}): AIAssistantRouteConfig {
  return {
    id: 'test-ide-route',
    enabled: true,
    scene: 'acm-problem',
    assistantConfig: acmAssistantConfig,
    match: {
      pattern: /^\/ide\/(?<problemId>[^/?#]+)$/,
    },
    resolveResourceId: (rt) => rt.routeParams.problemId ?? null,
    createAdapter: () => {
      throw new Error('test only');
    },
    ...overrides,
  };
}

function runTests() {
  const ideRoute = makeIdeRoute({
    rollout: { mode: 'allowlist', resourceIds: ['P4003', 'P4004'] },
  });

  const m1 = matchAssistantRoute(runtime('/ide/P4003'), [ideRoute]);
  assert.ok(m1);
  assert.strictEqual(m1!.resourceId, 'P4003');
  assert.strictEqual(m1!.routeParams.problemId, 'P4003');

  const m2 = matchAssistantRoute(runtime('/ide/P4004'), [ideRoute]);
  assert.ok(m2);
  assert.strictEqual(m2!.resourceId, 'P4004');

  const m3 = matchAssistantRoute(runtime('/ide/P5001'), [ideRoute]);
  assert.strictEqual(m3, null);

  const m4 = matchAssistantRoute(runtime('/p/P4003'), [ideRoute]);
  assert.strictEqual(m4, null);

  const whitelistRoute = makeIdeRoute({
    id: 'whitelist-route',
    match: {
      path: '/ide/:problemId',
      problemIds: ['P4003', 'P4004'],
    },
    rollout: undefined,
  });
  assert.ok(matchAssistantRoute(runtime('/ide/P4003'), [whitelistRoute]));
  assert.strictEqual(matchAssistantRoute(runtime('/ide/P9999'), [whitelistRoute]), null);

  const excludeRoute = makeIdeRoute({
    id: 'exclude-route',
    rollout: { mode: 'all' },
    match: {
      pattern: /^\/ide\/(?<problemId>[^/?#]+)$/,
      excludeProblemIds: ['P9998', 'P9999'],
    },
  });
  assert.ok(matchAssistantRoute(runtime('/ide/P4003'), [excludeRoute]));
  assert.strictEqual(matchAssistantRoute(runtime('/ide/P9999'), [excludeRoute]), null);

  const disabledRoute = makeIdeRoute({ enabled: false, rollout: { mode: 'all' } });
  assert.strictEqual(matchAssistantRoute(runtime('/ide/P4003'), [disabledRoute]), null);

  const lowPriority = makeIdeRoute({
    id: 'low',
    priority: 10,
    rollout: { mode: 'all' },
  });
  const highPriority = makeIdeRoute({
    id: 'high',
    priority: 100,
    rollout: { mode: 'all' },
  });
  const conflict = matchAssistantRoute(runtime('/ide/P4003'), [lowPriority, highPriority]);
  assert.strictEqual(conflict!.routeConfig.id, 'high');

  const allRoute = makeIdeRoute({
    id: 'all-ide',
    rollout: { mode: 'all' },
  });
  assert.ok(matchAssistantRoute(runtime('/ide/P5001'), [allRoute]));

  console.log('[assistant-route-matcher] tests passed');
}

if (require.main === module) {
  runTests();
}

export { runTests };
