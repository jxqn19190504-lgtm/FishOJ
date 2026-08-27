import type { AIAssistantRouteConfig } from './assistant-route.types';

const DEV = typeof process !== 'undefined'
  ? process.env.NODE_ENV !== 'production'
  : true;

export function validateAssistantRouteConfig(config: AIAssistantRouteConfig): string[] {
  const errors: string[] = [];

  if (!config.id) errors.push('缺少 id');
  if (!config.scene) errors.push(`[${config.id}] 缺少 scene`);
  if (typeof config.enabled !== 'boolean') {
    errors.push(`[${config.id}] enabled 必须为 boolean`);
  }

  const hasMatch = !!(config.match.path || config.match.pattern || config.match.routeName);
  if (!hasMatch) errors.push(`[${config.id}] 需提供 path、pattern 或 routeName 之一`);

  if (!config.assistantConfig?.id) {
    errors.push(`[${config.id}] assistantConfig.id 缺失`);
  }
  if (!config.createAdapter) {
    errors.push(`[${config.id}] 缺少 createAdapter`);
  }

  const features = config.assistantConfig.features || {};
  if (features.languageSelector && features.codeContext) {
    // adapter 可选方法，仅开发提示
  }
  if (features.codeContext) {
    // 运行时校验 adapter 方法
  }

  if (config.rollout?.mode === 'allowlist' && !config.rollout.resourceIds?.length && !config.match.problemIds?.length) {
    errors.push(`[${config.id}] rollout allowlist 需配置 resourceIds 或 match.problemIds`);
  }

  return errors;
}

export function validateAssistantRouteRegistry(registry: AIAssistantRouteConfig[]): void {
  if (!DEV) return;
  const ids = new Set<string>();
  for (const config of registry) {
    const errors = validateAssistantRouteConfig(config);
    if (errors.length) {
      console.error('[AIAssistantHost] 路由配置校验失败:', errors);
    }
    if (ids.has(config.id)) {
      console.warn('[AIAssistantHost] 重复的路由配置 id:', config.id);
    }
    ids.add(config.id);
  }
}
