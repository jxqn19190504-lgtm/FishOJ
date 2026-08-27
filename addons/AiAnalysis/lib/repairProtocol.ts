/**
 * 提交记录 AI 分析：结构化修复协议（Diff / 完整代码 / 无需修改）。
 * - 模型在文末输出 ```record-ai-repair JSON
 * - 服务端校验后写回干净 JSON；前端将代码块升级为 Diff UI
 */

export type RecordAiRepairVerdict = 'correct' | 'local_fix' | 'full_rewrite';

export type RecordAiRepairHunk = {
  title?: string;
  reason: string;
  before: string;
  after: string;
};

export type RecordAiRepairPayload = {
  verdict: RecordAiRepairVerdict;
  summary?: string;
  /** full_rewrite：为何不适合局部 Diff */
  reasonNotLocal?: string;
  lang?: string;
  hunks?: RecordAiRepairHunk[];
  /** full_rewrite 必填；local_fix 可选参考 */
  fullCode?: string;
};

export const RECORD_AI_REPAIR_FENCE_LANG = 'record-ai-repair';

const FENCE_RE = /```(?:record-ai-repair|record_ai_repair)\s*\n([\s\S]*?)```/i;
const MAX_HUNKS = 8;
const MAX_HUNK_LINES = 48;
/** 单 hunk before 超过提交代码行数比例则视为过大 */
const MAX_HUNK_FRAC = 0.45;
const MAX_TOTAL_CHANGED_LINES = 80;

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * DRF 输出规范：诊断 → 分流 → 修复。
 * 小改只走 Diff（local_fix）；大改只走完整代码（full_rewrite）；AC 只讲解法要点。
 */
export function buildRecordAiRepairOutputRequirements(statusIsAccepted: boolean): string {
  if (statusIsAccepted) {
    return [
      '【输出要求｜DRF】勿寒暄。使用 Markdown。latex 用 $。',
      '只输出下列标题下的最终正文：禁止思考/推理过程，禁止 think/thinking/analysis 标签，禁止「材料策略」「先判断」「让我分析」等元叙述。用户不应看到你在 thinking。',
      '严格按以下标题顺序输出（不要增删一级标题）：',
      '## 结论',
      '（1～2 句：代码正确、可通过本题。）',
      '## 解法要点',
      '1. 算法/数据结构要点',
      '2. 正确性关键（为何覆盖约束/边界）',
      '3. 时间与空间复杂度（有意义再写）',
      '',
      '文末必须附且仅附一个机器可读代码块，语言标记为 record-ai-repair：',
      '```record-ai-repair',
      '{"verdict":"correct","summary":"一句话总结","hunks":[]}',
      '```',
      'AC 场景 verdict 必须为 "correct"；禁止输出 Diff、hunks 非空、或完整重写代码。',
    ].join('\n');
  }
  return [
    '【输出要求｜DRF｜诊断→分流→修复】勿寒暄。使用 Markdown。latex 用 $。',
    '只输出下列标题下的最终正文：禁止思考/推理过程，禁止 think/thinking/analysis 标签，禁止「材料策略」「先判断」「让我分析」等元叙述。用户不应看到你在 thinking。',
    '',
    '先在内部判断修复类型（不要只按修改行数机械决定；判断过程不要写入回答）：',
    '1. 用户原有解题思路是否成立？是否非官方但正确的解法？',
    '2. 错误是局部实现问题，还是整体方案/复杂度/数据结构问题？',
    '3. 是否可在保留原算法与代码结构的前提下，用可对齐原文的小 Diff 可靠修复？',
    '若思路正确：优先沿用户写法做最小修改，不要因与官方题解不同而整段重写。',
    '拿不准能否对齐原文 → 直接 full_rewrite，禁止硬凑 Diff。',
    '',
    '严格按以下标题顺序输出（不要增删一级标题）：',
    '## 结论',
    '（1～2 句：是否通过倾向 + 一句话根因 + 修复类型：局部修复 / 整体调整 / 无需修改）',
    '## 问题诊断',
    '（对照评测结果，用 1～3 条说明错在哪、为什么）',
    '## 修复说明',
    '（按分流写，见下；小改可列修改点标题，大改说明为何不用 Diff）',
    '',
    '【分流规则｜必须遵守】',
    '- 小改 → verdict=local_fix：',
    '  · 正文不要贴完整修正代码，也不要再手写大段改前/改后对比；',
    '  · 改动只通过文末 JSON 的 hunks 展示为 Diff；',
    '  · 每个独立修改点必须单独占一个 hunk（例如缺分号、循环上界错误应拆成 2 个 hunk），禁止把多处修改揉进同一个巨大 before/after；',
    '  · 多个 hunk 时按在源码中出现的先后顺序排列；before 优先写「原始提交代码」中的片段；若后一处依赖前一处修改后的文本，也可按应用顺序写 before；',
    '  · 单 hunk 宜短（只含必要上下文行）；禁止把整份代码塞进一个 Diff；不要填 fullCode。',
    '- 大改 → verdict=full_rewrite：',
    '  · hunks 必须为 []；',
    '  · 在「## 修复说明」之后增加「## 完整修正代码」，并给出完整可提交代码围栏；',
    '  · JSON 必填 fullCode 与 reasonNotLocal；',
    '  · 禁止输出 Diff / 非空 hunks。',
    '- 无需改代码（少用）→ verdict=correct：无 Diff、无完整重写代码。',
    '',
    '文末必须附且仅附一个机器可读代码块，语言标记为 record-ai-repair，内容为单个 JSON：',
    '```record-ai-repair',
    '{',
    '  "verdict": "local_fix | full_rewrite | correct",',
    '  "summary": "一句话，与「结论」一致",',
    '  "reasonNotLocal": "仅 full_rewrite：说明为何不适合局部 Diff",',
    '  "lang": "cpp|python|java|...",',
    '  "hunks": [',
    '    {',
    '      "title": "短标题",',
    '      "reason": "为什么要改",',
    '      "before": "提交代码中真实存在的连续片段（含必要缩进）",',
    '      "after": "修改后的对应片段"',
    '    }',
    '  ],',
    '  "fullCode": "仅 full_rewrite 必填；local_fix 不要填"',
    '}',
    '```',
  ].join('\n');
}

function normalizeNewlines(s: string): string {
  return String(s || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** 宽松匹配：逐行 trimEnd，便于模型漏掉行尾空格时仍能命中 */
function normalizeForMatch(s: string): string {
  return normalizeNewlines(s)
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n');
}

function stripCommonIndent(t: string): string {
  const lines = t.split('\n');
  const indents = lines
    .filter((l) => l.trim().length)
    .map((l) => (l.match(/^[ \t]*/)?.[0].length ?? 0));
  if (!indents.length) return t;
  const m = Math.min(...indents);
  if (m <= 0) return t;
  return lines.map((l) => (l.trim().length ? l.slice(m) : l)).join('\n');
}

/**
 * 在 source 中替换首个匹配的 before → after。
 * 匹配策略与 findSnippetInSource 一致（原文 / trimEnd / 去公共缩进）。
 * 找不到则返回 null。
 */
export function replaceFirstSnippet(source: string, before: string, after: string): string | null {
  const src = normalizeNewlines(source);
  const snip = normalizeNewlines(before);
  const repl = normalizeNewlines(after);
  if (!snip.trim()) return null;

  if (src.includes(snip)) {
    const i = src.indexOf(snip);
    return src.slice(0, i) + repl + src.slice(i + snip.length);
  }

  const srcLines = src.split('\n');
  const snipTrim = snip.split('\n').map((l) => l.replace(/\s+$/g, ''));
  for (let i = 0; i <= srcLines.length - snipTrim.length; i++) {
    let ok = true;
    for (let j = 0; j < snipTrim.length; j++) {
      if (srcLines[i + j].replace(/\s+$/g, '') !== snipTrim[j]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    return [
      ...srcLines.slice(0, i),
      ...repl.split('\n'),
      ...srcLines.slice(i + snipTrim.length),
    ].join('\n');
  }

  // 去公共缩进后再按行匹配，替换时仍用源码原始行
  const srcStrippedLines = stripCommonIndent(normalizeForMatch(src)).split('\n');
  const snipStripped = stripCommonIndent(normalizeForMatch(snip)).split('\n');
  if (snipStripped.length >= 2) {
    for (let i = 0; i <= srcStrippedLines.length - snipStripped.length; i++) {
      let ok = true;
      for (let j = 0; j < snipStripped.length; j++) {
        if (srcStrippedLines[i + j] !== snipStripped[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      return [
        ...srcLines.slice(0, i),
        ...repl.split('\n'),
        ...srcLines.slice(i + snipStripped.length),
      ].join('\n');
    }
  }

  return null;
}

export function findSnippetInSource(source: string, snippet: string): boolean {
  // 用空 after 探测是否可定位；真正替换请用 replaceFirstSnippet
  return replaceFirstSnippet(source, snippet, snippet) != null;
}

/**
 * 在 source 中定位 snippet 起始行（1-based），匹配策略与 replaceFirstSnippet 一致。
 * 找不到返回 null。
 */
export function findSnippetStartLine(source: string, snippet: string): number | null {
  const src = normalizeNewlines(source);
  const snip = normalizeNewlines(snippet);
  if (!snip.trim()) return null;

  if (src.includes(snip)) {
    const i = src.indexOf(snip);
    return src.slice(0, i).split('\n').length;
  }

  const srcLines = src.split('\n');
  const snipTrim = snip.split('\n').map((l) => l.replace(/\s+$/g, ''));
  for (let i = 0; i <= srcLines.length - snipTrim.length; i++) {
    let ok = true;
    for (let j = 0; j < snipTrim.length; j++) {
      if (srcLines[i + j].replace(/\s+$/g, '') !== snipTrim[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i + 1;
  }

  const srcStrippedLines = stripCommonIndent(normalizeForMatch(src)).split('\n');
  const snipStripped = stripCommonIndent(normalizeForMatch(snip)).split('\n');
  if (snipStripped.length >= 2) {
    for (let i = 0; i <= srcStrippedLines.length - snipStripped.length; i++) {
      let ok = true;
      for (let j = 0; j < snipStripped.length; j++) {
        if (srcStrippedLines[i + j] !== snipStripped[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i + 1;
    }
  }

  return null;
}

function countLines(s: string): number {
  if (!s) return 0;
  return normalizeNewlines(s).split('\n').length;
}

function asVerdict(v: unknown): RecordAiRepairVerdict | null {
  const s = String(v || '').trim();
  if (s === 'correct' || s === 'local_fix' || s === 'full_rewrite') return s;
  return null;
}

export function parseRecordAiRepairPayload(raw: unknown): RecordAiRepairPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const verdict = asVerdict(o.verdict);
  if (!verdict) return null;
  const hunksIn = Array.isArray(o.hunks) ? o.hunks : [];
  const hunks: RecordAiRepairHunk[] = [];
  for (const h of hunksIn.slice(0, MAX_HUNKS)) {
    if (!h || typeof h !== 'object') continue;
    const hh = h as Record<string, unknown>;
    const before = normalizeNewlines(String(hh.before ?? ''));
    const after = normalizeNewlines(String(hh.after ?? ''));
    const reason = String(hh.reason ?? '').trim();
    if (!before.trim() && !after.trim()) continue;
    hunks.push({
      title: hh.title != null ? String(hh.title).trim() : undefined,
      reason: reason || '需要修改此处',
      before,
      after,
    });
  }
  return {
    verdict,
    summary: o.summary != null ? String(o.summary).trim() : undefined,
    reasonNotLocal: o.reasonNotLocal != null ? String(o.reasonNotLocal).trim() : undefined,
    lang: o.lang != null ? String(o.lang).trim() : undefined,
    hunks,
    fullCode: o.fullCode != null ? normalizeNewlines(String(o.fullCode)) : undefined,
  };
}

export function extractRecordAiRepairFence(markdown: string): {
  payload: RecordAiRepairPayload | null;
  bodyMarkdown: string;
  rawJson: string;
} {
  const md = String(markdown || '');
  const m = md.match(FENCE_RE);
  if (!m) {
    return { payload: null, bodyMarkdown: md, rawJson: '' };
  }
  const rawJson = String(m[1] || '').trim();
  let payload: RecordAiRepairPayload | null = null;
  try {
    payload = parseRecordAiRepairPayload(JSON.parse(rawJson));
  } catch {
    payload = null;
  }
  const bodyMarkdown = (md.slice(0, m.index) + md.slice((m.index || 0) + m[0].length)).trim();
  return { payload, bodyMarkdown, rawJson };
}

/**
 * 校验并可能降级 verdict；返回可安全交给前端的 payload。
 * 无法形成可靠 Diff 时降级为 full_rewrite（有 fullCode）或丢弃协议（null）。
 */
export function validateRecordAiRepairPayload(
  payload: RecordAiRepairPayload,
  submitCode: string,
): RecordAiRepairPayload | null {
  const submit = normalizeNewlines(submitCode);
  const submitLines = countLines(submit.trim() ? submit : ' ');

  if (payload.verdict === 'correct') {
    return {
      verdict: 'correct',
      summary: payload.summary || '代码正确，无需修改',
      lang: payload.lang,
      hunks: [],
    };
  }

  if (payload.verdict === 'full_rewrite') {
    const fullCode = String(payload.fullCode || '').trim();
    if (!fullCode) return null;
    return {
      verdict: 'full_rewrite',
      summary: payload.summary,
      reasonNotLocal: payload.reasonNotLocal || '当前问题不适合用局部 Diff 表达，建议对照完整修正代码理解。',
      lang: payload.lang,
      hunks: [],
      fullCode,
    };
  }

  // local_fix：按顺序应用 hunk，支持「后一处 before 依赖前一处修改」；独立多处也可全部命中
  const validHunks: RecordAiRepairHunk[] = [];
  let changedLines = 0;
  let working = submit;
  for (const h of payload.hunks || []) {
    const before = h.before;
    const after = h.after;
    if (!before.trim()) continue;
    if (countLines(before) > MAX_HUNK_LINES || countLines(after) > MAX_HUNK_LINES) continue;
    // 仅当提交代码足够长时用占比限制，避免短代码被误杀多行小 hunk
    if (submitLines >= 40 && countLines(before) / submitLines > MAX_HUNK_FRAC) continue;
    if (normalizeForMatch(before) === normalizeForMatch(after)) continue;

    let next = replaceFirstSnippet(working, before, after);
    if (next == null && working !== submit) {
      // 回退：相对原始提交再试（非重叠的多处独立修改）
      next = replaceFirstSnippet(submit, before, after);
      if (next != null) {
        const appliedOnWorking = replaceFirstSnippet(working, before, after);
        if (appliedOnWorking == null) continue;
        next = appliedOnWorking;
      }
    }
    if (next == null) continue;

    working = next;
    validHunks.push({
      title: h.title,
      reason: h.reason || '需要修改此处',
      before,
      after,
    });
    changedLines += Math.max(countLines(before), countLines(after));
  }

  if (!validHunks.length || changedLines > MAX_TOTAL_CHANGED_LINES) {
    const fullCode = String(payload.fullCode || '').trim();
    if (fullCode) {
      return {
        verdict: 'full_rewrite',
        summary: payload.summary,
        reasonNotLocal:
          payload.reasonNotLocal
          || (!validHunks.length
            ? '无法将修改可靠对齐到提交代码原文，已降级为完整修正代码。'
            : '修改范围过大，已降级为完整修正代码，避免巨大 Diff。'),
        lang: payload.lang,
        hunks: [],
        fullCode,
      };
    }
    return null;
  }

  // 小改只走 Diff：不携带 fullCode，避免前端/缓存误用完整代码
  return {
    verdict: 'local_fix',
    summary: payload.summary,
    lang: payload.lang,
    hunks: validHunks,
  };
}

function fencePayload(payload: RecordAiRepairPayload): string {
  return `\`\`\`${RECORD_AI_REPAIR_FENCE_LANG}\n${JSON.stringify(payload)}\n\`\`\``;
}

/**
 * 处理模型 Markdown：校验 Diff 协议，写回干净 fence；解析失败则原样返回（兼容旧格式）。
 */
export function finalizeRecordAiRepairMarkdown(markdown: string, submitCode: string): string {
  const { payload, bodyMarkdown } = extractRecordAiRepairFence(markdown);
  if (!payload) {
    // 无协议或 JSON 坏掉：保持原文，前端忽略
    return String(markdown || '');
  }
  const validated = validateRecordAiRepairPayload(payload, submitCode);
  if (!validated) {
    return bodyMarkdown || String(markdown || '');
  }

  const parts: string[] = [];
  if (bodyMarkdown.trim()) parts.push(bodyMarkdown.trim());

  if (validated.verdict === 'full_rewrite' && validated.fullCode?.trim()) {
    // 大改只展示完整代码：正文缺代码围栏时补上；已有则不重复
    const hasCodeFence = /```(?!record-ai-repair|record_ai_repair)[\w+-]*\n[\s\S]*?```/i.test(bodyMarkdown);
    if (!hasCodeFence) {
      const lang = validated.lang || '';
      const hasHeading = /^##\s*完整修正代码\s*$/m.test(bodyMarkdown);
      parts.push(
        `${hasHeading ? '' : '## 完整修正代码\n\n'}\`\`\`${lang}\n${validated.fullCode.trim()}\n\`\`\``,
      );
    }
  }

  parts.push(fencePayload(validated));
  return parts.join('\n\n');
}

/** 行级 LCS Diff，供前端渲染（GitHub 风格双列相对行号） */
export type RecordAiDiffLine = {
  type: 'ctx' | 'del' | 'add';
  text: string;
  /** before 侧 1-based 行号；add 行为 undefined */
  oldLine?: number;
  /** after 侧 1-based 行号；del 行为 undefined */
  newLine?: number;
};

export function computeLineDiff(before: string, after: string): RecordAiDiffLine[] {
  const a = normalizeNewlines(before).split('\n');
  const b = normalizeNewlines(after).split('\n');
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: RecordAiDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'ctx', text: a[i], oldLine: i + 1, newLine: j + 1 });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: a[i], oldLine: i + 1 });
      i += 1;
    } else {
      out.push({ type: 'add', text: b[j], newLine: j + 1 });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ type: 'del', text: a[i], oldLine: i + 1 });
    i += 1;
  }
  while (j < m) {
    out.push({ type: 'add', text: b[j], newLine: j + 1 });
    j += 1;
  }
  return out;
}

/** 仅用于服务端日志/测试的轻量转义导出 */
export function escapeRecordAiRepairHtml(text: string): string {
  return escapeHtml(text);
}
