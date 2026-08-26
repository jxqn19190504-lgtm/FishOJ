import { slideAssistantHistoryWindow } from '../shared/assistant-history';
import {
  ASSISTANT_MAX_QUESTION_LEN,
  ASSISTANT_MAX_QUOTE_LEN,
  type AssistantHistoryMessage,
  type AssistantMode,
  type AssistantQuote,
  type AssistantStreamRequest,
} from '../shared/assistant-types';
import { normalizeCodeLanguage } from '../shared/assistant-code-language';
import type { ACMAssistantClientSnapshot } from '../shared/acm/acm-assistant.types';

const ALLOWED_ABBREVIATIONS = new Set(['hot100', 'interview', 'acm', 'ide']);

const ALLOWED_SCENES = new Set([
  'hot100-note',
  'ide-problem',
  'acm-problem',
]);

export function isAssistantFeatureEnabled(abbreviation: string, scene?: string): boolean {
  const abbr = String(abbreviation || '').trim();
  if (ALLOWED_ABBREVIATIONS.has(abbr)) return true;
  const s = String(scene || '').trim();
  return ALLOWED_SCENES.has(s);
}

export function parseAssistantStreamRequest(body: unknown): AssistantStreamRequest {
  const req = (body || {}) as Record<string, unknown>;
  const question = String(req.question || '').trim();
  if (!question) throw new Error('请输入问题');
  if (question.length > ASSISTANT_MAX_QUESTION_LEN) {
    throw new Error(`问题过长（最多 ${ASSISTANT_MAX_QUESTION_LEN} 字）`);
  }

  const ctxRaw = (req.clientContext || {}) as Record<string, unknown>;
  const abbreviation = String(ctxRaw.abbreviation || '').trim();
  const pid = String(ctxRaw.pid || '').trim();
  const modeRaw = String(ctxRaw.mode || 'learning').trim();
  const mode: AssistantMode = modeRaw === 'practice' ? 'practice' : 'learning';
  const scene = ctxRaw.scene ? String(ctxRaw.scene).trim() : undefined;
  const codeLanguageRaw = ctxRaw.codeLanguage ? normalizeCodeLanguage(ctxRaw.codeLanguage) : '';
  const deepThink = ctxRaw.deepThink === true || ctxRaw.deepThink === 'true' || ctxRaw.deepThink === 1 || ctxRaw.deepThink === '1';

  if (!abbreviation || !pid) throw new Error('缺少页面上下文');
  const isAcmScene = scene === 'acm-problem' || scene === 'ide-problem';
  if (!isAcmScene && !isAssistantFeatureEnabled(abbreviation, scene)) {
    throw new Error('当前页面暂未开放 AI 助教');
  }
  if (isAcmScene && !isAssistantFeatureEnabled('acm', scene)) {
    throw new Error('当前页面暂未开放 AI 助教');
  }

  let acmSnapshot: ACMAssistantClientSnapshot | undefined;
  if (ctxRaw.acmSnapshot && typeof ctxRaw.acmSnapshot === 'object') {
    const snap = ctxRaw.acmSnapshot as Record<string, unknown>;
    acmSnapshot = {
      domainId: snap.domainId ? String(snap.domainId) : undefined,
      docId: snap.docId != null ? Number(snap.docId) : undefined,
      tid: snap.tid != null && String(snap.tid).trim() !== '' ? snap.tid as number | string : undefined,
      bankType: snap.bankType ? String(snap.bankType) : undefined,
      problemSetId: snap.problemSetId ? String(snap.problemSetId) : undefined,
      problemSetAbbr: snap.problemSetAbbr ? String(snap.problemSetAbbr) : undefined,
      antiCrawlBanned: snap.antiCrawlBanned === true,
      antiCrawlLimited: snap.antiCrawlLimited === true,
      ide: snap.ide && typeof snap.ide === 'object' ? snap.ide as ACMAssistantClientSnapshot['ide'] : undefined,
      runtime: snap.runtime && typeof snap.runtime === 'object'
        ? snap.runtime as ACMAssistantClientSnapshot['runtime']
        : undefined,
    };
  }

  let quote: AssistantQuote | null = null;
  if (req.quote && typeof req.quote === 'object') {
    const q = req.quote as Record<string, unknown>;
    const content = String(q.content || '').trim();
    if (content) {
      if (content.length > ASSISTANT_MAX_QUOTE_LEN) {
        throw new Error(`引用内容过长（最多 ${ASSISTANT_MAX_QUOTE_LEN} 字）`);
      }
      quote = {
        type: q.type === 'code' ? 'code' : 'text',
        content,
        language: q.language ? String(q.language) : undefined,
        headingPath: Array.isArray(q.headingPath)
          ? q.headingPath.map((x) => String(x)).slice(0, 8)
          : undefined,
        sourceType: q.sourceType === 'article-selection' ? 'article-selection' : undefined,
        articleTitle: q.articleTitle ? String(q.articleTitle) : undefined,
        sectionTitle: q.sectionTitle ? String(q.sectionTitle) : undefined,
      };
    }
  }

  const historyRaw: AssistantHistoryMessage[] = [];
  if (Array.isArray(req.history)) {
    for (const item of req.history) {
      if (!item || typeof item !== 'object') continue;
      const role = (item as any).role === 'assistant' ? 'assistant' : 'user';
      const content = String((item as any).content || '').trim();
      if (!content) continue;
      historyRaw.push({ role, content });
    }
  }
  // 服务端再做一次滑动窗口，防止客户端绕过限制灌入过长历史
  const history = slideAssistantHistoryWindow(historyRaw);

  return {
    conversationId: req.conversationId ? String(req.conversationId) : undefined,
    question,
    quote,
    clientContext: {
      abbreviation: isAcmScene ? 'acm' : abbreviation,
      pid,
      mode,
      ...(scene ? { scene } : {}),
      headingId: ctxRaw.headingId ? String(ctxRaw.headingId) : undefined,
      ...(codeLanguageRaw ? { codeLanguage: codeLanguageRaw } : {}),
      ...(deepThink ? { deepThink: true } : {}),
      ...(typeof ctxRaw.includeStaticProblemContext === 'boolean'
        ? { includeStaticProblemContext: ctxRaw.includeStaticProblemContext }
        : {}),
      ...(acmSnapshot ? { acmSnapshot } : {}),
    },
    history,
  };
}
