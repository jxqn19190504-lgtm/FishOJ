import { STATUS } from 'hydrooj';
import { buildRecordAiRepairOutputRequirements } from './repairProtocol';

/** FishOJ：无固定官方题解 UID 列表；handler 侧按空列表跳过或拉全部管理员解 */
export const CODE_REVIEW_ADMINSOL_UIDS: number[] = [];

/**
 * user_first：提交代码思路明确 → 优先以提交代码拼 prompt
 * official_guide：提交代码无明显思路 / 与官方题解相似 → 官方题解为思路，IDE 代码为模版
 */
export type RecordAiPromptMaterialMode = 'user_first' | 'official_guide';

const STUB_LINE_RE =
  /^(#include|using\s+namespace|import\s+|package\s+|public\s+class|int\s+main\s*\(|def\s+main|fn\s+main|using\s+System)/i;

function stripCodeNoise(code: string): string {
  return String(code || '')
    .replace(/\/\*[\s\S]*?\*\//g, '\n')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/#[^\n]*/g, '')
    .replace(/'''[\s\S]*?'''/g, '\n')
    .replace(/"""[\s\S]*?"""/g, '\n');
}

/** 粗判：提交代码是否已体现较明确的算法思路 */
export function hasClearCodeApproach(code: string): boolean {
  const cleaned = stripCodeNoise(code);
  const lines = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !STUB_LINE_RE.test(l));
  if (lines.length < 8) return false;
  const body = lines.join(' ');
  if (body.length < 120) return false;
  const ioOnly = (body.match(/\b(cin|cout|scanf|printf|input\(|print\(|read|write)\b/gi) || []).length;
  const control = (body.match(/\b(for|while|if|else|return|switch|case)\b/gi) || []).length;
  return control >= 3 || (lines.length >= 12 && ioOnly < lines.length);
}

function tokenizeCodeForSimilarity(code: string): Set<string> {
  const cleaned = stripCodeNoise(code).toLowerCase();
  const tokens = cleaned.match(/[a-z_][a-z0-9_]{2,}/g) || [];
  const stop = new Set([
    'int', 'long', 'for', 'while', 'if', 'else', 'return', 'void', 'main', 'string',
    'vector', 'map', 'set', 'true', 'false', 'null', 'this', 'new', 'class', 'public',
    'private', 'static', 'const', 'auto', 'bool', 'char', 'float', 'double', 'import',
    'from', 'def', 'print', 'input', 'len', 'range', 'self', 'none', 'var', 'let',
    'function', 'console', 'system', 'include', 'using', 'namespace', 'std',
  ]);
  const out = new Set<string>();
  for (const t of tokens) {
    if (!stop.has(t)) out.add(t);
  }
  return out;
}

/** 粗判提交代码与官方题解是否思路同构 */
export function isCodeApproachSimilarToOfficial(submitCode: string, official: string): boolean {
  const a = tokenizeCodeForSimilarity(submitCode);
  const b = tokenizeCodeForSimilarity(official);
  if (a.size < 6 || b.size < 6) return false;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  if (union <= 0) return false;
  return inter / union >= 0.28 && inter >= 8;
}

/**
 * 材料策略判定：以「提交代码」为主。
 * - 提交代码思路明确且与官方不高度同构 → user_first
 * - 否则（无明显思路或与官方相似）→ official_guide
 */
export function resolveRecordAiPromptMaterialMode(opts: {
  submitCode: string;
  officialSol: string;
}): RecordAiPromptMaterialMode {
  const submit = String(opts.submitCode || '').trim();
  const official = String(opts.officialSol || '').trim();
  if (!official) return 'user_first';
  if (!hasClearCodeApproach(submit)) return 'official_guide';
  if (isCodeApproachSimilarToOfficial(submit, official)) return 'official_guide';
  return 'user_first';
}

export function buildRecordAiMaterialStrategyText(mode: RecordAiPromptMaterialMode): string {
  if (mode === 'official_guide') {
    return `【材料使用策略｜官方题解引导】
- 提交代码缺少明确算法思路，或与官方题解思路高度同构。
- 请以「官方题解」作为正确思路来源，以「当前 IDE 代码」为代码模版（若无 IDE 代码则用提交代码作模版），修正「提交代码」中的问题。
- 保留用户命名风格与结构习惯，但算法路径对齐题解要点；不要原样粘贴官方题解全文。
- 目标是修好本次提交：小改用 local_fix（仅 Diff）；大改用 full_rewrite（仅完整代码）。输出格式见文末【输出要求】。`;
  }
  return `【材料使用策略｜优先提交代码思路】
- 提交代码已体现较明确的算法思路。
- 请优先基于「提交代码」定位问题并给出最小必要修正；尽量延续提交代码的写法与结构。
- 「官方题解」仅作对照参考：不要因为写法不同就判错；允许多种正确解法；非官方但正确的解法应沿用户思路改，不要强行改成官方写法。
- 「当前 IDE 代码」若与提交不同，仅作辅助上下文，仍以修好提交代码为准。
- 小改 → local_fix（仅 Diff）；大改 → full_rewrite（仅完整代码），不要为了 Diff 硬凑。输出格式见文末【输出要求】。`;
}

/**
 * 兼容旧调用：内部转到结构化拼装。
 */
export function buildCodeReviewPrompt(
  problem_content: string,
  user_code: string,
  admin_sol: string,
  status: number,
): string {
  return buildRecordAiAnalysisUserPrompt({
    problemContent: problem_content,
    submitCode: user_code,
    ideCode: '',
    officialSol: admin_sol,
    judgeResult: '',
    status,
  });
}

/**
 * 提交记录 AI 分析：服务端按已写代码 + 策略拼装 user prompt。
 * 官方题解仅服务端注入，不经前端模板传参。
 */
export function buildRecordAiAnalysisUserPrompt(input: {
  problemContent: string;
  submitCode: string;
  ideCode?: string;
  officialSol?: string;
  judgeResult?: string;
  status: number;
}): string {
  const submitCode = String(input.submitCode || '');
  const ideCode = String(input.ideCode || '').trim();
  const officialSol = String(input.officialSol || '').trim();
  const judgeResult = String(input.judgeResult || '').trim();
  const mode = resolveRecordAiPromptMaterialMode({
    submitCode,
    officialSol,
  });

  const blocks: string[] = [
    `【题目】\n${input.problemContent}`,
    `【提交代码】\n${submitCode || '(空)'}`,
  ];

  if (ideCode && ideCode !== submitCode) {
    blocks.push(`【当前 IDE 代码】\n${ideCode}`);
  } else if (ideCode) {
    blocks.push('【当前 IDE 代码】与提交代码相同。');
  } else {
    blocks.push('【当前 IDE 代码】（未提供，模版场景下沿用提交代码）');
  }

  if (judgeResult) {
    blocks.push(`【评测结果】\n${judgeResult}`);
  }

  // 官方题解：仅在 official_guide 或需要对照时注入；user_first 也给简短对照但标明勿照抄
  if (officialSol) {
    if (mode === 'official_guide') {
      blocks.push(`【官方题解｜作思路来源】\n${officialSol}`);
    } else {
      blocks.push(`【官方题解｜仅对照，勿照抄】\n${officialSol}`);
    }
  } else {
    blocks.push('【官方题解】（无）');
  }

  blocks.push(buildRecordAiMaterialStrategyText(mode));

  if (input.status === STATUS.STATUS_ACCEPTED) {
    blocks.push(buildRecordAiRepairOutputRequirements(true));
  } else if (input.status === STATUS.STATUS_COMPILE_ERROR) {
    blocks.push(
      '【评测补充】这是编译错误：优先依据「编译日志」定位问题；能局部改编译错误则用 local_fix，否则 full_rewrite。\n'
      + buildRecordAiRepairOutputRequirements(false),
    );
  } else {
    blocks.push(buildRecordAiRepairOutputRequirements(false));
  }

  return blocks.join('\n\n');
}
