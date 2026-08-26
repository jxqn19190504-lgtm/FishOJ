import { ObjectId, RecordModel } from 'hydrooj';
import {
  extractZhContentFromProblemContent,
  parseAcmStatementContent,
} from '../shared/acm/acm-statement-parser';
import type { ACMAssistantPermissionContext } from '../shared/acm/acm-assistant.types';
import type { ACMProblemBankAssistantPolicy } from '../shared/acm/acm-assistant.types';
import type { ACMAssistantClientSnapshot } from '../shared/acm/acm-assistant.types';
import { formatAcmStatusLabel } from '../shared/acm/acm-status-label';
import { resolveAcmAssistantAccess } from './AcmAssistantAccessResolver';
import { throwAssistantAccessDenied } from './AssistantContentAccess';

function truncate(text: string, maxLen: number): string {
  const s = String(text || '').trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
}

function summarizeTestCases(testCases: unknown, maxCases = 8): string[] {
  if (!Array.isArray(testCases) || !testCases.length) return [];
  const lines: string[] = [];
  for (const tc of testCases.slice(0, maxCases)) {
    if (!tc || typeof tc !== 'object') continue;
    const row = tc as Record<string, unknown>;
    const id = row.id ?? row.caseId ?? row.fid ?? '?';
    const st = formatAcmStatusLabel(row.status);
    const time = row.time != null ? `${row.time}ms` : '-';
    const mem = row.memory != null ? `${(Number(row.memory) / 1024).toFixed(1)}MB` : '-';
    const score = row.score != null ? String(row.score) : '-';
    lines.push(`- 用例 ${id}：${st}；耗时 ${time}；内存 ${mem}；得分 ${score}`);
  }
  if (testCases.length > maxCases) {
    lines.push(`- …另有 ${testCases.length - maxCases} 个用例未展开`);
  }
  return lines;
}

/** IDE 代码读取结果：present=有内容；empty=已读到编辑器但为空；unavailable=无权限或未挂上 bridge */
export type AcmIdeCodeStatus = 'present' | 'empty' | 'unavailable';

export type BuiltAcmAssistantContext = {
  title: string;
  pid: string;
  docId: number;
  domainId: string;
  bankType: string;
  problemSetId?: string;
  permissions: ACMAssistantPermissionContext;
  availableCapabilities: string[];
  contextBlock: string;
  codeLanguage?: string;
  /** present 时为截断后的代码；empty 时为 ''；unavailable 时为 undefined */
  currentCode?: string;
  ideCodeStatus: AcmIdeCodeStatus;
  customTestInput?: string;
};

/** 按权限声明本轮实际可用的材料能力 */
function listCapabilities(
  permissions: ACMAssistantPermissionContext,
  policy: ACMProblemBankAssistantPolicy,
  extras?: { hasOfficialSolution?: boolean },
): string[] {
  const caps: string[] = [];
  if (permissions.resource.canReadStatement && policy.features.problemContext) caps.push('acm.problem.get');
  if (permissions.capabilities.canReadCode) {
    caps.push('acm.ide.getCurrentCode', 'acm.ide.getCurrentLanguage');
  }
  if (permissions.capabilities.canReadCustomTest) caps.push('acm.ide.getCustomTest');
  if (extras?.hasOfficialSolution) caps.push('acm.officialSolution.get');
  if (permissions.capabilities.canReadOwnRunResult) caps.push('acm.run.getResult');
  if (permissions.capabilities.canReadOwnConsoleOutput) caps.push('acm.run.getConsole');
  if (permissions.capabilities.canReadOwnSubmissions) caps.push('acm.submission.list');
  if (permissions.capabilities.canReadOwnSubmissionCode) caps.push('acm.submission.get');
  return caps;
}

async function appendRuntimeSection(
  parts: string[],
  input: {
    domainId: string;
    viewerUid: number;
    pdoc: any;
    snapshot: ACMAssistantClientSnapshot;
    permissions: ACMAssistantPermissionContext;
  },
): Promise<void> {
  const { permissions, snapshot } = input;
  const canResult = permissions.capabilities.canReadOwnRunResult;
  const canConsole = permissions.capabilities.canReadOwnConsoleOutput;
  if (!canResult && !canConsole) return;

  let runtime = snapshot.runtime || {};
  const runId = String(runtime.latestRunId || '').trim();

  let testCases: unknown;
  // 有权限时用服务端记录补全快照（正式提交/自测终态）
  if (runId && (canResult || canConsole)) {
    try {
      const rdoc = await RecordModel.get(new ObjectId(runId));
      if (
        rdoc
        && Number(rdoc.uid) === input.viewerUid
        && Number(rdoc.pid) === Number(input.pdoc.docId)
      ) {
        const judge = Array.isArray(rdoc.judgeTexts)
          ? rdoc.judgeTexts.map((x: unknown) => String(x ?? ''))
          : [];
        const isPretest = String(rdoc.type || '') === 'pretest';
        runtime = {
          latestRunId: runId,
          runKind: isPretest ? 'pretest' : 'submission',
          status: rdoc.status != null ? String(rdoc.status) : runtime.status,
          statusLabel: formatAcmStatusLabel(rdoc.status),
          score: typeof rdoc.score === 'number' ? rdoc.score : runtime.score,
          compilerOutput: judge.join('\n') || runtime.compilerOutput,
          stdout: rdoc.output != null ? String(rdoc.output) : runtime.stdout,
          stderr: rdoc.error != null ? String(rdoc.error) : runtime.stderr,
          timeUsed: rdoc.time ?? runtime.timeUsed,
          memoryUsed: rdoc.memory ?? runtime.memoryUsed,
        };
        testCases = rdoc.testCases;
      }
    } catch {
      /* 快照仍可用 */
    }
  }

  if (!runtime.latestRunId && runtime.status == null && !runtime.stderr && !runtime.compilerOutput) {
    return;
  }

  parts.push('', '## 最近运行/评测摘要（本人）');
  if (runtime.runKind) {
    parts.push(`- 类型：${runtime.runKind === 'pretest' ? '自测' : '正式提交'}`);
  }
  if (runtime.latestRunId) parts.push(`- 记录 ID：${runtime.latestRunId}`);
  const statusLabel = runtime.statusLabel
    || (runtime.status != null ? formatAcmStatusLabel(runtime.status) : '');
  if (statusLabel && statusLabel !== '-') {
    parts.push(`- 状态：${statusLabel}${runtime.status != null ? `（码 ${runtime.status}）` : ''}`);
  }
  if (canResult && runtime.score != null) parts.push(`- 得分：${runtime.score}`);
  if (canResult && runtime.timeUsed != null) parts.push(`- 耗时：${runtime.timeUsed}ms`);
  if (canResult && runtime.memoryUsed != null) {
    parts.push(`- 内存：${(Number(runtime.memoryUsed) / 1024).toFixed(1)}MB`);
  }
  if (canResult && runtime.compilerOutput) {
    parts.push('- 评测反馈 / 编译输出：', '```', truncate(runtime.compilerOutput, 3000), '```');
  }
  if (canConsole && runtime.stderr) {
    parts.push('- stderr / 错误日志：', '```', truncate(runtime.stderr, 2500), '```');
  }
  if (canConsole && runtime.stdout) {
    parts.push('- stdout / 程序输出：', '```', truncate(runtime.stdout, 2500), '```');
  }
  if (canResult) {
    const caseLines = summarizeTestCases(testCases, 8);
    if (caseLines.length) {
      parts.push('- 用例摘要：', ...caseLines);
    }
  }
}

async function appendSubmissionHistorySection(
  parts: string[],
  input: {
    domainId: string;
    viewerUid: number;
    pdoc: any;
    permissions: ACMAssistantPermissionContext;
  },
): Promise<void> {
  if (!input.permissions.capabilities.canReadOwnSubmissions) return;

  try {
    const rdocs = await RecordModel.getMulti(
      input.domainId,
      {
        uid: input.viewerUid,
        pid: input.pdoc.docId,
        type: { $ne: 'pretest' },
      },
    )
      .sort({ _id: -1 })
      .limit(5)
      .toArray();

    parts.push('', '## 最近提交记录（本人，最多 5 条）');
    if (!rdocs.length) {
      parts.push('- （暂无正式提交）');
      return;
    }

    const canCode = input.permissions.capabilities.canReadOwnSubmissionCode;
    const canResult = input.permissions.capabilities.canReadOwnRunResult;
    const canConsole = input.permissions.capabilities.canReadOwnConsoleOutput;

    for (const r of rdocs) {
      const id = String(r._id);
      const label = formatAcmStatusLabel(r.status);
      const at = r._id?.getTimestamp?.()?.toISOString?.() || '';
      const time = r.time != null ? `${r.time}ms` : '-';
      const mem = r.memory != null ? `${(Number(r.memory) / 1024).toFixed(1)}MB` : '-';
      parts.push(
        `- 提交 ${id}：${label}；语言 ${r.lang || '-'}；得分 ${r.score ?? '-'}；耗时 ${time}；内存 ${mem}${at ? `；时间 ${at}` : ''}`,
      );
      if (canResult) {
        const judge = Array.isArray(r.judgeTexts)
          ? r.judgeTexts.map((x: unknown) => String(x ?? '')).filter(Boolean).join('\n')
          : '';
        if (judge.trim()) {
          parts.push(`  评测反馈：${truncate(judge.replace(/\s+/g, ' '), 400)}`);
        }
      }
      if (canConsole && r.error != null && String(r.error).trim()) {
        parts.push(`  错误日志：${truncate(String(r.error).replace(/\s+/g, ' '), 300)}`);
      }
    }
    if (!canCode) {
      parts.push('- （无提交代码读取权限，未注入源码）');
    }
  } catch (e: any) {
    console.log('[AIAssistant] appendSubmissionHistorySection:', e?.message || e);
  }
}

export async function buildAcmAssistantContext(input: {
  domainId: string;
  viewerUid: number;
  pid: string;
  snapshot?: ACMAssistantClientSnapshot;
  codeLanguage?: string;
  /**
   * 为 true（默认）时注入完整题面/样例等稳定材料。
   * 追问轮次应传 false：仅刷新 IDE 代码、自测、运行摘要等动态段，降低 token 压力。
   */
  includeStaticProblemContext?: boolean;
}): Promise<BuiltAcmAssistantContext> {
  const snapshot = input.snapshot || {};
  const includeStatic = input.includeStaticProblemContext !== false;
  const { permissions, policy, psid, bankType, pdoc } = await resolveAcmAssistantAccess({
    domainId: input.domainId,
    viewerUid: input.viewerUid,
    pid: input.pid,
    docId: snapshot.docId,
    tid: snapshot.tid,
    activeProblemSetId: snapshot.problemSetId,
    antiCrawlBanned: snapshot.antiCrawlBanned,
    antiCrawlLimited: snapshot.antiCrawlLimited,
  });

  if (!permissions.resource.canAccessAssistant) {
    throwAssistantAccessDenied(permissions.deniedReasons?.[0] || 'PROBLEM_ACCESS_DENIED');
  }

  const title = String(pdoc?.title || input.pid);

  const parts: string[] = [
    '# ACM 编程题上下文',
    `- 题号：${pdoc.pid}`,
    `- 标题：${title}`,
    `- 域：${input.domainId}`,
    `- 题库类型：${bankType}`,
    ...(psid ? [`- 当前题库：${psid}`] : []),
  ];

  // 追问轮也注入压缩题面，避免「首轮注入但 history 无题面」导致幻觉
  const budget = includeStatic
    ? { desc: 8000, io: 4000, range: 2000, exIn: 2000, exOut: 2000, exExplain: 1500, exCount: 8, sol: 4000 }
    : { desc: 2800, io: 1200, range: 800, exIn: 800, exOut: 800, exExplain: 400, exCount: 3, sol: 1800 };

  const rawStatement = permissions.resource.canReadStatement
    ? extractZhContentFromProblemContent(pdoc?.content)
    : '';
  const parsed = rawStatement ? parseAcmStatementContent(rawStatement) : null;

  const algTags: string[] = Array.isArray(pdoc?.alg_tag) ? [...pdoc.alg_tag] : [];
  const companyTags: string[] = [];

  const tl = pdoc?.config && typeof pdoc.config === 'object'
    ? (pdoc.config as any).timeLimit
    : undefined;
  const ml = pdoc?.config && typeof pdoc.config === 'object'
    ? (pdoc.config as any).memoryLimit
    : undefined;

  if (!includeStatic) {
    parts.push('', '## 题面材料（追问压缩版）', '以下为服务端本轮重新注入的压缩题面，请以此核对题意，勿臆造条件。');
  }

  if (parsed?.description) {
    parts.push('', '## 题目描述', truncate(parsed.description, budget.desc));
  }
  if (parsed?.inputDescription) {
    parts.push('', '## 输入描述', truncate(parsed.inputDescription, budget.io));
  }
  if (parsed?.outputDescription) {
    parts.push('', '## 输出描述', truncate(parsed.outputDescription, budget.io));
  }
  if (parsed?.dataRangeText) {
    parts.push('', '## 数据范围', truncate(parsed.dataRangeText, budget.range));
  }
  if (parsed?.examples?.length) {
    parts.push('', '## 样例');
    for (const ex of parsed.examples.slice(0, budget.exCount)) {
      parts.push(`### 样例 ${ex.index}`);
      if (ex.input) parts.push('输入：', '```', truncate(ex.input, budget.exIn), '```');
      if (ex.output) parts.push('输出：', '```', truncate(ex.output, budget.exOut), '```');
      if (ex.explanation) parts.push('解释：', truncate(ex.explanation, budget.exExplain));
    }
  }
  if (includeStatic && parsed?.images?.length) {
    parts.push('', '## 题面图片元数据（无法直接读取图片内容）');
    for (const img of parsed.images.slice(0, 20)) {
      parts.push(`- [${img.sourceSection}] ${img.url}${img.alt ? ` (${img.alt})` : ''}`);
    }
  }
  if (tl != null || ml != null) {
    parts.push('', '## 限制');
    if (tl != null) parts.push(`- 时间限制：${tl}ms`);
    if (ml != null) parts.push(`- 内存限制：${ml}KB`);
  }
  if (algTags.length) parts.push('', '## 算法标签', algTags.join('、'));
  if (companyTags.length) parts.push('', '## 公司标签', companyTags.join('、'));

  const hasOfficialSolution = false;

  const codeLanguage = input.codeLanguage || snapshot.ide?.language;
  // 代码不进 contextBlock：由 PromptBuilder 按「首轮嵌入 / 追问权威回合」结构放置。
  // 关键：空字符串必须保留为 empty，不能当成 unavailable，否则模型会回退到历史旧代码。
  let ideCodeStatus: AcmIdeCodeStatus = 'unavailable';
  let currentCode: string | undefined;
  if (permissions.capabilities.canReadCode && snapshot.ide && typeof snapshot.ide === 'object') {
    const raw = String(snapshot.ide.code ?? '');
    if (raw.trim()) {
      ideCodeStatus = 'present';
      currentCode = truncate(raw, 12000);
    } else {
      ideCodeStatus = 'empty';
      currentCode = '';
    }
  }
  const customTestInput = permissions.capabilities.canReadCustomTest
    ? snapshot.ide?.customTestInput
    : undefined;

  if (codeLanguage) parts.push('', '## 当前 IDE 语言', codeLanguage);
  parts.push('', '## 当前 IDE 代码状态');
  if (ideCodeStatus === 'present') {
    parts.push('- 状态：已读取，有内容（完整代码见下方消息，不在此重复）');
  } else if (ideCodeStatus === 'empty') {
    parts.push('- 状态：已读取，编辑器当前为空（无任何代码）');
    parts.push('- 约束：不得使用历史对话中的旧代码进行分析或引用');
  } else {
    parts.push('- 状态：未能读取编辑器（无权限或 IDE 未就绪）');
    parts.push('- 约束：不得臆造用户代码，也不得把历史代码当成当前 IDE 代码');
  }
  if (customTestInput) {
    parts.push('', '## 当前自测输入', '```', truncate(customTestInput, 4000), '```');
  }

  await appendRuntimeSection(parts, {
    domainId: input.domainId,
    viewerUid: input.viewerUid,
    pdoc,
    snapshot,
    permissions,
  });

  await appendSubmissionHistorySection(parts, {
    domainId: input.domainId,
    viewerUid: input.viewerUid,
    pdoc,
    permissions,
  });

  parts.push('', '## 权限摘要（服务端校验，不可绕过）');
  parts.push(`- 可读题面：${permissions.resource.canReadStatement ? '是' : '否'}`);
  parts.push(`- 可读代码：${permissions.capabilities.canReadCode ? '是' : '否'}`);
  parts.push(`- 可读官方题解：${permissions.capabilities.canReadOfficialSolution ? '是' : '否'}`);
  parts.push(`- 可读本人运行结果：${permissions.capabilities.canReadOwnRunResult ? '是' : '否'}`);
  parts.push(`- 可读本人运行日志：${permissions.capabilities.canReadOwnConsoleOutput ? '是' : '否'}`);
  parts.push(`- 可读本人提交列表：${permissions.capabilities.canReadOwnSubmissions ? '是' : '否'}`);
  parts.push(`- 可读本人提交代码：${permissions.capabilities.canReadOwnSubmissionCode ? '是' : '否'}`);

  const availableCapabilities = listCapabilities(permissions, policy, { hasOfficialSolution });

  return {
    title,
    pid: String(pdoc.pid || input.pid),
    docId: Number(pdoc.docId || snapshot.docId || 0),
    domainId: input.domainId,
    bankType,
    problemSetId: psid || undefined,
    permissions,
    availableCapabilities,
    contextBlock: parts.join('\n'),
    codeLanguage,
    currentCode,
    ideCodeStatus,
    customTestInput,
  };
}
