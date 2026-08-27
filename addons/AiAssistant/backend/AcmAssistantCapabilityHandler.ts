import { Handler, ObjectId, RecordModel } from 'hydrooj';
import { getTextSolution } from '../lib/fishojStubs';
import { formatAcmStatusLabel } from '../shared/acm/acm-status-label';
import { parseAssistantStreamRequest } from './AssistantValidator';
import { resolveAcmAssistantAccess } from './AcmAssistantAccessResolver';
import { assistantAccessDeniedMessage } from './AssistantContentAccess';

const ALLOWED_CAPABILITIES = new Set([
  'acm.officialSolution.get',
  'acm.submission.list',
  'acm.submission.get',
  'acm.run.getResult',
  'acm.run.getConsole',
]);

function judgeTextsOf(rdoc: any): string {
  const judge = Array.isArray(rdoc?.judgeTexts) ? rdoc.judgeTexts : [];
  return judge.map((x: unknown) => String(x ?? '')).filter(Boolean).join('\n');
}

function serializeTestCases(testCases: unknown, max = 20) {
  if (!Array.isArray(testCases)) return undefined;
  return testCases.slice(0, max).map((tc: any) => ({
    id: tc?.id ?? tc?.caseId ?? tc?.fid,
    status: tc?.status != null ? String(tc.status) : undefined,
    statusLabel: formatAcmStatusLabel(tc?.status),
    time: tc?.time,
    memory: tc?.memory,
    score: tc?.score,
    message: tc?.message != null ? String(tc.message).slice(0, 500) : undefined,
  }));
}

export class AcmAssistantCapabilityHandler extends Handler {
  /** 业务层已做登录/题目能力校验；避免 VIP 域角色缺 PERM_VIEW 时被框架 403 */
  noCheckPermView = true;

  async post() {
    const uid = Number(this.user?._id || 0);
    if (!uid) {
      this.response.body = { ok: false, error: '请先登录', code: 'UNAUTHORIZED' };
      return;
    }

    const body = (this.request.body || {}) as Record<string, unknown>;
    let parsed;
    try {
      parsed = parseAssistantStreamRequest({
        question: 'capability',
        clientContext: body.clientContext,
      });
    } catch (e: any) {
      this.response.body = { ok: false, error: e?.message || '参数无效' };
      return;
    }

    const capabilityId = String(body.capabilityId || '').trim();
    if (!ALLOWED_CAPABILITIES.has(capabilityId)) {
      this.response.body = { ok: false, error: '不支持的能力', code: 'CAPABILITY_DISABLED' };
      return;
    }

    const snapshot = parsed.clientContext.acmSnapshot;
    const { permissions, pdoc } = await resolveAcmAssistantAccess({
      domainId: this.domain._id,
      viewerUid: uid,
      pid: parsed.clientContext.pid,
      docId: snapshot?.docId,
      tid: snapshot?.tid,
      activeProblemSetId: snapshot?.problemSetId,
      antiCrawlBanned: snapshot?.antiCrawlBanned,
      antiCrawlLimited: snapshot?.antiCrawlLimited,
    });

    if (!permissions.resource.canAccessAssistant) {
      const reason = permissions.deniedReasons?.[0] || 'PROBLEM_ACCESS_DENIED';
      this.response.body = {
        ok: false,
        error: assistantAccessDeniedMessage(reason),
        code: reason,
      };
      return;
    }

    if (capabilityId === 'acm.officialSolution.get') {
      if (!permissions.capabilities.canReadOfficialSolution) {
        this.response.body = {
          ok: true,
          result: { status: 'not_allowed', reason: 'permission_denied' },
        };
        return;
      }
      const content = await getTextSolution(this.domain._id, pdoc);
      if (!content?.trim()) {
        this.response.body = { ok: true, result: { status: 'not_found' } };
        return;
      }
      this.response.body = {
        ok: true,
        result: { status: 'allowed', content: { markdown: content.slice(0, 20000) } },
      };
      return;
    }

    if (capabilityId === 'acm.run.getResult' || capabilityId === 'acm.run.getConsole') {
      const needResult = capabilityId === 'acm.run.getResult';
      const allowed = needResult
        ? permissions.capabilities.canReadOwnRunResult
        : permissions.capabilities.canReadOwnConsoleOutput;
      if (!allowed) {
        this.response.body = {
          ok: false,
          error: needResult ? '无权查询运行结果' : '无权查询运行日志',
          code: 'PERMISSION_DENIED',
        };
        return;
      }
      const runId = String((body.input as any)?.runId || snapshot?.runtime?.latestRunId || '').trim();
      if (!runId) {
        this.response.body = { ok: false, error: '缺少 runId' };
        return;
      }
      const rdoc = await RecordModel.get(new ObjectId(runId));
      if (!rdoc || Number(rdoc.uid) !== uid || Number(rdoc.pid) !== Number(pdoc.docId)) {
        this.response.body = { ok: false, error: '运行记录不存在或无权访问', code: 'PERMISSION_DENIED' };
        return;
      }
      const judge = judgeTextsOf(rdoc);
      const isPretest = String(rdoc.type || '') === 'pretest';
      if (needResult) {
        this.response.body = {
          ok: true,
          result: {
            runId,
            runKind: isPretest ? 'pretest' : 'submission',
            status: String(rdoc.status ?? ''),
            statusLabel: formatAcmStatusLabel(rdoc.status),
            score: rdoc.score,
            compilerOutput: judge.slice(0, 8000),
            judgeFeedback: judge.slice(0, 8000),
            stdout: permissions.capabilities.canReadOwnConsoleOutput && rdoc.output != null
              ? String(rdoc.output).slice(0, 8000)
              : undefined,
            stderr: permissions.capabilities.canReadOwnConsoleOutput && rdoc.error != null
              ? String(rdoc.error).slice(0, 8000)
              : undefined,
            timeUsed: rdoc.time,
            memoryUsed: rdoc.memory,
            testCases: serializeTestCases(rdoc.testCases, 20),
          },
        };
      } else {
        this.response.body = {
          ok: true,
          result: {
            runId,
            runKind: isPretest ? 'pretest' : 'submission',
            status: String(rdoc.status ?? ''),
            statusLabel: formatAcmStatusLabel(rdoc.status),
            compilerOutput: judge.slice(0, 8000),
            stdout: rdoc.output != null ? String(rdoc.output).slice(0, 8000) : undefined,
            stderr: rdoc.error != null ? String(rdoc.error).slice(0, 8000) : undefined,
          },
        };
      }
      return;
    }

    if (capabilityId === 'acm.submission.list') {
      if (!permissions.capabilities.canReadOwnSubmissions) {
        this.response.body = { ok: false, error: '无权查询提交', code: 'PERMISSION_DENIED' };
        return;
      }
      const limit = Math.min(20, Math.max(1, Number((body.input as any)?.limit || 10)));
      const cursor = Number((body.input as any)?.cursor || 0);
      const rdocs = await RecordModel.getMulti(
        this.domain._id,
        {
          uid,
          pid: pdoc.docId,
          type: { $ne: 'pretest' },
        },
      )
        .sort({ _id: -1 })
        .skip(cursor)
        .limit(limit + 1)
        .toArray();

      const hasMore = rdocs.length > limit;
      const page = hasMore ? rdocs.slice(0, limit) : rdocs;
      this.response.body = {
        ok: true,
        result: {
          items: page.map((r: any) => ({
            submissionId: String(r._id),
            language: String(r.lang || ''),
            status: String(r.status ?? ''),
            statusLabel: formatAcmStatusLabel(r.status),
            score: r.score,
            submittedAt: r._id?.getTimestamp?.()?.toISOString?.() || '',
            timeUsed: r.time,
            memoryUsed: r.memory,
            judgeFeedbackPreview: permissions.capabilities.canReadOwnRunResult
              ? truncateOneLine(judgeTextsOf(r), 200)
              : undefined,
          })),
          nextCursor: hasMore ? cursor + limit : undefined,
        },
      };
      return;
    }

    if (capabilityId === 'acm.submission.get') {
      if (!permissions.capabilities.canReadOwnSubmissions
        && !permissions.capabilities.canReadOwnSubmissionCode) {
        this.response.body = { ok: false, error: '无权查询提交', code: 'PERMISSION_DENIED' };
        return;
      }
      const submissionId = String((body.input as any)?.submissionId || '').trim();
      if (!submissionId) {
        this.response.body = { ok: false, error: '缺少 submissionId' };
        return;
      }
      const rdoc = await RecordModel.get(new ObjectId(submissionId));
      if (!rdoc || Number(rdoc.uid) !== uid || Number(rdoc.pid) !== Number(pdoc.docId)) {
        this.response.body = { ok: false, error: '提交不存在或无权访问', code: 'PERMISSION_DENIED' };
        return;
      }
      const judge = judgeTextsOf(rdoc);
      this.response.body = {
        ok: true,
        result: {
          submissionId,
          language: String(rdoc.lang || ''),
          code: permissions.capabilities.canReadOwnSubmissionCode
            ? String(rdoc.code || '').slice(0, 20000)
            : undefined,
          status: String(rdoc.status ?? ''),
          statusLabel: formatAcmStatusLabel(rdoc.status),
          score: rdoc.score,
          submittedAt: rdoc._id?.getTimestamp?.()?.toISOString?.() || '',
          timeUsed: rdoc.time,
          memoryUsed: rdoc.memory,
          judgeFeedback: permissions.capabilities.canReadOwnRunResult
            ? judge.slice(0, 8000)
            : undefined,
          compilerOutput: permissions.capabilities.canReadOwnRunResult
            ? judge.slice(0, 8000)
            : undefined,
          stdout: permissions.capabilities.canReadOwnConsoleOutput && rdoc.output != null
            ? String(rdoc.output).slice(0, 8000)
            : undefined,
          stderr: permissions.capabilities.canReadOwnConsoleOutput && rdoc.error != null
            ? String(rdoc.error).slice(0, 8000)
            : undefined,
          testCases: permissions.capabilities.canReadOwnRunResult
            ? serializeTestCases(rdoc.testCases, 20)
            : undefined,
        },
      };
      return;
    }

    this.response.body = { ok: false, error: '未处理的能力' };
  }
}

function truncateOneLine(text: string, maxLen: number): string | undefined {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}
