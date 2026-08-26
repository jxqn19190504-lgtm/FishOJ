import { hot100AssistantConfig } from '../../configs/hot100.config';
import { createHot100AssistantAdapter } from '../../adapters/hot100/hot100.adapter';
import { readInitialCodeNoteContext } from '../../adapters/hot100/codenote-page-context';
import type { AIAssistantRouteConfig } from '../assistant-route.types';

/**
 * CodeNote Hot100 笔记页路由。
 * 入口 `/codenote/hot100` 无 pid 时，用页面 data-intro-pid 作为当前笔记（与 CodeNote 前端一致）。
 * 仅改本路由配置，不改动 CodeNote / Host 等其它组件。
 */
export const hot100NoteAssistantRoute: AIAssistantRouteConfig = {
  id: 'hot100-note-route',
  enabled: true,
  priority: 100,

  match: {
    pattern: /^\/codenote\/(?<abbreviation>[^/?#]+)(?:\/(?<pid>[^/?#]+))?\/?$/,
  },

  scene: 'hot100-note',
  assistantConfig: hot100AssistantConfig,

  resolveResourceId: (runtime) => {
    if (runtime.routeParams.abbreviation !== 'hot100') return null;
    if (runtime.routeParams.pid) return runtime.routeParams.pid;
    // /codenote/hot100 入口：与 codenote.page 相同，回退 intro pid
    return readInitialCodeNoteContext()?.pid || null;
  },

  resolveConfig: () => {
    const initial = readInitialCodeNoteContext();
    if (!initial?.abbreviation) {
      return { ...hot100AssistantConfig, enabled: false };
    }
    return {
      ...hot100AssistantConfig,
      legacyAbbreviation: initial.abbreviation,
      enabled: hot100AssistantConfig.enabled && initial.abbreviation === 'hot100',
    };
  },

  createAdapter: () => {
    const initial = readInitialCodeNoteContext();
    if (!initial) {
      throw new Error('[hot100-note-route] 无法读取 CodeNote 页面上下文');
    }
    return createHot100AssistantAdapter(initial);
  },
};
