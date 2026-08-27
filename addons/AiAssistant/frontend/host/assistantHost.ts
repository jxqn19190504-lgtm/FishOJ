import { createAssistantController } from '../core/createAssistantController';
import { assistantRouteRegistry } from '../registry/assistant-route-registry';
import { matchAssistantRoute } from '../registry/assistant-route-matcher';
import type { AssistantRouteMatch } from '../registry/assistant-route.types';
import {
  getAssistantRouteRuntime,
  installAssistantRouteListener,
} from './assistantRouteRuntime';
import type { AssistantController } from '../core/createAssistantController';

let activeKey: string | null = null;
let controller: AssistantController | null = null;
let teardownNavigation: (() => void) | null = null;
let hostStarted = false;
let syncScheduled = false;

function buildInstanceKey(match: AssistantRouteMatch, configId: string): string {
  return [configId, match.routeConfig.scene, match.resourceId].join(':');
}

function disposeController() {
  try {
    controller?.dispose();
  } catch (err) {
    console.error('[AIAssistantHost] dispose failed:', err);
  }
  controller = null;
  activeKey = null;
}

function mountAssistant(match: AssistantRouteMatch, nextKey: string): boolean {
  const runtime = getAssistantRouteRuntime();
  const config = match.routeConfig.resolveConfig?.(runtime) ?? match.routeConfig.assistantConfig;

  if (!config.enabled) {
    disposeController();
    return false;
  }

  let adapter;
  try {
    adapter = match.routeConfig.createAdapter({
      ...runtime,
      routeParams: match.routeParams,
    });
  } catch (err) {
    console.error('[AIAssistantHost] adapter 创建失败:', err);
    disposeController();
    return false;
  }

  if (adapter.isAccessAllowed && !adapter.isAccessAllowed()) {
    console.warn('[AIAssistantHost] 当前页面不允许挂载 AI 助教');
    disposeController();
    return false;
  }

  try {
    const nextController = createAssistantController({ config, adapter });
    const initialized = nextController.init();
    if (!initialized) {
      console.warn('[AIAssistantHost] 控制器 init 返回空');
      disposeController();
      return false;
    }
    controller = nextController;
    activeKey = nextKey;
    return true;
  } catch (err) {
    console.error('[AIAssistantHost] 组件加载或初始化失败:', err);
    disposeController();
    return false;
  }
}

function syncAssistantHost(): boolean {
  syncScheduled = false;
  const runtime = getAssistantRouteRuntime();
  const matched = matchAssistantRoute(runtime, assistantRouteRegistry);

  if (!matched) {
    disposeController();
    return false;
  }

  const config = matched.routeConfig.resolveConfig?.(runtime) ?? matched.routeConfig.assistantConfig;
  const nextKey = buildInstanceKey(matched, config.id);

  if (nextKey === activeKey && controller) return true;

  if (controller) disposeController();
  return mountAssistant(matched, nextKey);
}

function scheduleSync() {
  if (syncScheduled) return;
  syncScheduled = true;
  window.requestAnimationFrame(() => {
    syncAssistantHost();
  });
}

export function scheduleAssistantHostSync(): void {
  scheduleSync();
}

export function isAssistantHostMounted(): boolean {
  return !!document.getElementById('cf-assistant-root');
}

/** 等待控制器挂载（Monaco / Bridge 就绪后兜底） */
export function waitForAssistantHostController(
  maxAttempts = 40,
  intervalMs = 150,
): Promise<AssistantController | null> {
  return new Promise((resolve) => {
    let attempts = 0;
    const tick = () => {
      if (controller) {
        resolve(controller);
        return;
      }
      syncAssistantHost();
      attempts += 1;
      if (attempts >= maxAttempts) {
        if (!isAssistantHostMounted()) {
          console.warn('[AIAssistantHost] 等待挂载超时', window.location.pathname);
        }
        resolve(null);
        return;
      }
      window.setTimeout(tick, intervalMs);
    };
    tick();
  });
}

/** 全局 AI 助教宿主：根据路由配置自动挂载/销毁 */
export function startAssistantHost(): () => void {
  if (hostStarted) {
    scheduleSync();
    return () => stopAssistantHost();
  }
  hostStarted = true;

  syncAssistantHost();
  teardownNavigation = installAssistantRouteListener(scheduleSync);

  return stopAssistantHost;
}

export function stopAssistantHost(): void {
  teardownNavigation?.();
  teardownNavigation = null;
  disposeController();
  hostStarted = false;
}
