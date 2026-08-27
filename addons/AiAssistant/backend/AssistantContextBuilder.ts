import {
  ProblemSetService,
  getTextSolution,
  CodeNoteValidator,
  getCodenoteVisibilityForProblem,
  canViewCodenoteByVisibility,
} from '../lib/fishojStubs';
import type { AssistantMode, AssistantQuote } from '../shared/assistant-types';
import {
  assertAssistantContentAccess,
  resolveHot100ContentAccess,
} from './AssistantContentAccess';

function getSettings(ps: any) {
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(ps?.CodeNoteSetting || '{}');
  } catch {
    settings = {};
  }
  return settings;
}

function stringifyProblemContent(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && typeof parsed.zh === 'string') {
        return parsed.zh;
      }
    } catch {
      return content;
    }
    return content;
  }
  if (typeof content === 'object' && content !== null && typeof (content as any).zh === 'string') {
    return (content as any).zh;
  }
  return String(content);
}

function stripMarkdownNoise(md: string): string {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, (block) => block.slice(0, 4000))
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .trim();
}

function truncate(text: string, maxLen: number): string {
  const s = String(text || '').trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
}

function extractNeighborhood(fullText: string, quote: AssistantQuote | null, radius = 800): string {
  if (!quote?.content) return '';
  const needle = quote.content.slice(0, 120);
  if (!needle) return '';
  const idx = fullText.indexOf(needle);
  if (idx < 0) return truncate(quote.content, radius);
  const start = Math.max(0, idx - radius);
  const end = Math.min(fullText.length, idx + needle.length + radius);
  return fullText.slice(start, end).trim();
}

export type BuiltAssistantContext = {
  title: string;
  pid: string;
  psid: string;
  abbreviation: string;
  mode: AssistantMode;
  isIntroPage: boolean;
  canSeeSolution: boolean;
  isReadLimited: boolean;
  /** 是否可注入题面/笔记正文（与页面可读范围一致） */
  canReadStatement: boolean;
  contextBlock: string;
};

export async function buildAssistantContext(input: {
  domainId: string;
  viewerUid: number;
  abbreviation: string;
  pid: string;
  mode: AssistantMode;
  quote?: AssistantQuote | null;
  /**
   * 为 true（默认）时注入题面/笔记/题解等稳定材料。
   * 追问轮次应传 false：仅保留轻量元信息与本轮划词等动态段。
   */
  includeStaticProblemContext?: boolean;
}): Promise<BuiltAssistantContext> {
  const { domainId, viewerUid, abbreviation, pid, mode, quote } = input;
  const includeStatic = input.includeStaticProblemContext !== false;
  const { psid, ps, pdoc, isIntroPage } = await CodeNoteValidator.validateAll(
    domainId,
    abbreviation,
    pid,
    viewerUid,
  );

  const title = String(pdoc?.title || pid);
  const baseContent = stripMarkdownNoise(stringifyProblemContent(pdoc?.content));
  const isLoggedIn = viewerUid > 0;
  const hasPsPerm = isLoggedIn && (await ProblemSetService.checkProblemSetPermission(viewerUid, psid));
  const { codenoteGuestFull } = getSettings(ps);
  const visibilityConfig = await getCodenoteVisibilityForProblem(domainId, pdoc.pid);
  const canViewByVisibility = await canViewCodenoteByVisibility(
    domainId,
    viewerUid,
    pdoc.pid,
    psid,
    visibilityConfig,
  );

  const access = resolveHot100ContentAccess({
    viewerUid,
    hasPsPerm: Boolean(hasPsPerm),
    canViewByVisibility,
    guestFullAccess: Boolean(codenoteGuestFull),
    isIntroPage: Boolean(isIntroPage),
    mode,
  });

  // 全局门禁：无权阅读页面正文时，禁止使用助教，避免未授权内容进入上下文
  assertAssistantContentAccess(access);

  const { canSeeSolution, isReadLimited, canReadStatement } = access;

  const parts: string[] = [
    '# 页面信息',
    `- 标题：${title}`,
    `- 题目 ID：${pdoc.pid}`,
    `- 模式：${mode}`,
    `- 是否介绍页：${isIntroPage ? '是' : '否'}`,
  ];

  // 追问轮也注入压缩正文/题解，避免仅靠「首轮已注入」说明导致幻觉
  const bodyBudget = includeStatic ? 6000 : 2400;
  const solBudget = includeStatic ? 6000 : 1800;
  if (!includeStatic) {
    parts.push(
      '',
      '## 静态材料（追问压缩版）',
      '以下为服务端本轮重新注入的压缩正文/题解，请以此核对细节，勿臆造内容。',
    );
  }

  if (canReadStatement && baseContent) {
    parts.push('', '## 题面与笔记正文（节选）', truncate(baseContent, bodyBudget));
  }

  if (canSeeSolution) {
    const solution = await getTextSolution(domainId, pdoc);
    if (solution) {
      parts.push('', '## 题解（仅 learning 且有权限）', truncate(stripMarkdownNoise(solution), solBudget));
    }
  } else if (mode === 'practice' && canReadStatement) {
    parts.push(
      '',
      '## 权限说明',
      '当前为练习模式：用户索要完整可提交代码时优先给渐进式提示；题意解释、复杂度分析、代码调试、通用算法知识与本站功能说明均可正常回答。',
    );
  }

  // 划词为每轮动态上下文，始终按需注入
  if (canReadStatement && quote?.content) {
    const neighborhood = extractNeighborhood(baseContent, quote || null);
    parts.push('', '## 用户选区', `- 类型：${quote.type}`, `- 内容：${truncate(quote.content, 1200)}`);
    if (quote.sourceType === 'article-selection') {
      parts.push('- 来源：正文划词引用');
      if (quote.articleTitle) parts.push(`- 笔记标题：${quote.articleTitle}`);
      if (quote.sectionTitle) parts.push(`- 章节：${quote.sectionTitle}`);
    }
    if (quote.language) parts.push(`- 代码语言：${quote.language}`);
    if (quote.headingPath?.length) parts.push(`- 章节路径：${quote.headingPath.join(' > ')}`);
    if (neighborhood) {
      parts.push('', '## 选区邻近上下文', truncate(neighborhood, 1600));
    }
  }

  return {
    title,
    pid: pdoc.pid,
    psid,
    abbreviation,
    mode,
    isIntroPage: Boolean(isIntroPage),
    canSeeSolution,
    isReadLimited,
    canReadStatement,
    contextBlock: parts.join('\n'),
  };
}
