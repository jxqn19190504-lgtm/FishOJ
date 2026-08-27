import type { AssistantMode } from '../../../shared/assistant-types';

/** CodeNote 页面上下文（Hot100 adapter 专用，不属于 AI 助教核心） */
export type CodeNotePageContext = {
  abbreviation: string;
  pid: string;
  psid: string;
  mode: AssistantMode;
  isIntro: boolean;
  uid: number;
  title: string;
  /** 与页面阅读遮罩一致：无题库权限或题面锁定时为 true */
  isReadLimited: boolean;
};

/** 从 DOM 推断当前是否阅读受限（遮罩已渲染时） */
export function detectCodeNoteReadLimitedFromDom(): boolean {
  const body = document.getElementById('markdown-body');
  if (!body) return false;
  return Boolean(
    body.querySelector('.read-limit-mask')
    || body.querySelector('.pd-lock-overlay'),
  );
}

export function readInitialCodeNoteContext(): CodeNotePageContext | null {
  const pageLayout = document.querySelector('.page-layout') as HTMLElement | null;
  if (!pageLayout) return null;
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts[0] !== 'codenote') return null;
  const abbreviation = pathParts[1] || '';
  const pid = pathParts[2] || pageLayout.getAttribute('data-intro-pid') || '';
  const psid = pageLayout.getAttribute('data-psid') || '';
  const uid = Number(pageLayout.getAttribute('data-uid') || '0');
  const introPid = pageLayout.getAttribute('data-intro-pid') || '';
  const titleEl = document.querySelector('.doc-header h1');
  const title = titleEl?.textContent?.trim() || pid;
  const modeRaw = localStorage.getItem('codenote_mode') || 'learning';
  const mode: AssistantMode = modeRaw === 'practice' ? 'practice' : 'learning';
  return {
    abbreviation,
    pid,
    psid,
    mode,
    isIntro: !!pid && pid === introPid,
    uid,
    title,
    isReadLimited: detectCodeNoteReadLimitedFromDom(),
  };
}
