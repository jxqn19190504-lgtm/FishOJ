import type { AIAssistantRouteRuntime } from '../registry/assistant-route.types';
import { readIdeProblemIdFromPage } from '../adapters/ide-problem/ide-problem.types';

function readPageName(): string | undefined {
  const htmlPage = document.documentElement.getAttribute('data-page');
  if (htmlPage) return htmlPage;
  const el = document.querySelector('.page-layout[data-page-name]') as HTMLElement | null;
  return el?.getAttribute('data-page-name') || undefined;
}

function extractRouteParams(pathname: string): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {};

  const ideMatch = /^\/ide\/([^/?#]+)/.exec(pathname);
  if (ideMatch) {
    params.problemId = ideMatch[1];
  }

  const codenoteMatch = /^\/codenote\/([^/?#]+)\/([^/?#]+)/.exec(pathname);
  if (codenoteMatch) {
    params.abbreviation = codenoteMatch[1];
    params.pid = codenoteMatch[2];
  }

  const uiProblemId = readIdeProblemIdFromPage();
  if (uiProblemId) {
    params.problemId = uiProblemId;
  }

  const pageName = readPageName();
  if (pageName) params.pageName = pageName;

  return params;
}

export function getAssistantRouteRuntime(): AIAssistantRouteRuntime {
  const { pathname, search, hash } = window.location;
  const routeParams = extractRouteParams(pathname);
  return {
    pathname,
    search,
    hash,
    routeParams,
    locationKey: `${pathname}${search}${hash}`,
    pageData: {
      pageName: routeParams.pageName,
    },
  };
}

export function installAssistantRouteListener(callback: () => void): () => void {
  const handler = () => {
    window.requestAnimationFrame(callback);
  };

  window.addEventListener('popstate', handler);
  window.addEventListener('hashchange', handler);

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = (...args: Parameters<History['pushState']>) => {
    originalPushState(...args);
    handler();
  };
  history.replaceState = (...args: Parameters<History['replaceState']>) => {
    originalReplaceState(...args);
    handler();
  };

  return () => {
    window.removeEventListener('popstate', handler);
    window.removeEventListener('hashchange', handler);
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  };
}
