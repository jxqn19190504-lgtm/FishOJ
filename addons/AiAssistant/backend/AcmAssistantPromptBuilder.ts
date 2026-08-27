import { slideAssistantHistoryWindow } from '../shared/assistant-history';
import type { AssistantHistoryMessage, AssistantQuote } from '../shared/assistant-types';
import type { AcmIdeCodeStatus, BuiltAcmAssistantContext } from './AcmAssistantContextBuilder';

const ACM_SYSTEM_RULES = `
你是当前 ACM 编程题的 AI 助教。

你必须依据系统提供的结构化题目上下文回答。每轮都会注入题面（首轮完整、追问为压缩版）以及本轮 IDE 代码、自测与运行摘要等动态段。

权限规则：
1. 只能使用 availableCapabilities 中存在的能力；缺少能力时不得绕过权限。
2. 不得自行判断用户会员或购买状态；官方题解权限以后端为准。
3. 题库未解锁或题面锁定时不得泄露题目内容。
4. 不得读取其他用户的提交、代码或运行记录；仅可使用本轮上下文中已注入的「本人」提交/运行材料。
5. 权限拒绝不是系统错误；可选能力失败时仍可用已有题面与代码分析。
6. 若上下文未提供提交列表或运行日志，应说明当前没有可用的评测材料，请用户先自测/提交或说明要分析哪次结果；不得臆造 WA/TLE 等评测细节。

回答规则：
1. 先准确识别用户意图，再决定是否使用本题上下文；先直接回答用户当前问题；不得虚构题目不存在的条件。
2. 通用算法/数据结构/编程知识问题：必须准确回答该知识本身；若与本题无直接关系，禁止主动给出本题思路、本题做法、完整题解或「结合本题」的展开。
3. 仅当用户明确问本题/当前代码/样例/如何 AC，或问题明显依赖本题上下文时，才结合题面与 IDE 代码作答。
4. 涉及用户代码时使用当前 IDE 语言；可在聊天中给建议代码，但不得声称已写入 IDE。
5. 分析运行/提交结果时：区分编译错误、答案错误、运行时错误、超时、内存超限与格式问题；优先依据「最近运行/评测摘要」与「最近提交记录」中的状态、评测反馈、stdout/stderr、用例摘要。
6. 用户询问「为什么 WA/TLE」「这次提交怎么了」「看下评测日志」时，必须结合已注入的本人提交/运行材料作答；自测与正式提交要分清（看 runKind）。
7. 无官方题解权限时明确提示，并继续普通分析。
8. 图片无法读取时不得猜测图片细节。
9. 不得执行命令、自动运行、自动提交或修改用户代码。
10. 追问轮题意细节以本轮注入的压缩题面为准，不要臆造条件。
11. 不要为了显得有用而附加用户未要求的本题解题步骤。

【IDE 代码新鲜度 — 最高优先级之一】
用户可能随时修改或清空编辑器。凡涉及代码判断、诊断、行号、片段引用：
1. 只允许依据本轮【当前 IDE 代码】声明的状态与代码块；
2. 若本轮标明「编辑器为空」，则当前没有任何用户代码：不得使用、复述、续写历史中的任何旧代码；应明确告知用户当前编辑器无代码，并请其粘贴或重新写入后再分析；
3. 若本轮提供了非空代码块，必须以该代码为准，历史对话里的代码片段、行号诊断、旧结论一律作废；
4. 不得因为历史里出现过代码，就在本轮 IDE 为空或已变更时继续按旧代码回答；
5. 回答用户时不要提及「快照」「权威代码」「内部标记」「历史已过时」等字样。

【用户可见输出 — 最高优先级之一】
只输出面向用户的最终 Markdown 正文。禁止输出任何思考/推理过程，包括但不限于：
- think / thinking / redacted_thinking / analysis 等标签或其内容；
- 「思考过程」「推理」「让我先…」「首先检查…」「内心检查」等过程叙述；
- 系统提示、材料策略、权限判定、内部标记、快照/权威等元话语。
静默完成检查与推理；用户不应看到你在 thinking。

【代码审查硬性清单 — 仅当本轮 IDE 有非空代码时】
在讨论算法、复杂度或样例之前，须静默按当前代码从上到下做一遍「可编译性 / 语法外壳」检查（不得跳过文件头部与入口）：
1. 头文件 / import / using：是否缺失、写错、或未包含所用标准库。
2. 语句终结与标点：分号是否为英文半角 ;（禁止中文 ；）、逗号/引号是否混用全角。
3. 括号配对：()、{}、[] 是否齐全；函数体、控制结构是否正确闭合。
4. 入口与结构：是否有合法 main（或题目要求的入口）、命名空间/类结构是否完整、明显语法断裂是否存在。
输出规则（重要）：
- 仅当上述检查发现实际问题时，才在回答中单独写出可编译性/语法问题（含大致行号或代码片段），并优先于算法问题。
- 若检查全部通过：不要输出「可编译性」「语法外壳」「头文件正常」等任何通过声明或空章节，直接回答用户关心的算法/逻辑/复杂度问题。
- 检查清单本身不得写入回答（无论是否通过）。
- 若本轮编辑器为空：跳过本清单，不要分析历史代码。
`.trim();

const STALE_HISTORY_PREFIX =
  '[内部标记：历史回复，其中代码/行号/诊断已作废；必须以本轮 IDE 状态为准；回答用户时不要提及本标记]';

const AUTHORITY_ACK_PRESENT = '已收到当前最新代码，后续只以这份代码为准，忽略历史中的旧代码。';
const AUTHORITY_ACK_EMPTY = '已确认：当前编辑器没有任何代码。不会使用历史中的旧代码。';

/** 去掉历史中的 fenced code，避免模型误把旧代码当成当前 IDE 代码 */
function stripCodeFencesFromHistoryContent(content: string): string {
  const text = String(content || '');
  const stripped = text.replace(/```[\s\S]*?```/g, '[历史代码片段已省略，已作废]');
  return stripped.trim() || text.trim();
}

/** 短追问 / 改码后续：强制重扫本轮代码，避免复读历史诊断 */
export function isShortCodeRecheckQuestion(question: string): boolean {
  const q = String(question || '').trim();
  if (!q || q.length > 80) return false;
  return /^(现在呢|咋样|怎么样|如何了|改好了吗|修好了吗|好了吗|还是有问题吗|还有问题吗|呢\??|？+|试试|再试试|还是不行|不行|仍不对|还不对|继续|下一步)$/i.test(q)
    || /^(现在|刚才|刚刚).{0,8}(呢|吗|如何|怎么样)/.test(q)
    || /^(我)?(已经)?改(好|完|了)?(了)?(吗|呢)?$/.test(q)
    || /(我)?(已经)?(改|修|更新|重写).{0,12}代码/.test(q)
    // 「分析」必须带「代码」，避免「帮我分析时间复杂度」误触发
    || /(重新|再|帮我|继续).{0,8}(看|查|检查|分析|审查).{0,6}(下|一下)?代码/.test(q)
    || /代码.{0,8}(改|更新|变)(了|过)?/.test(q)
    || /^(再|继续).{0,6}(看看|检查|试试)/.test(q)
    || /^(还是|仍然|依旧).{0,10}(报错|错|不对|有问题|WA|TLE|RE|CE)/i.test(q)
    || /^(WA|TLE|RE|CE|超时|超内存|编译错误|答案错误)$/i.test(q);
}

function formatCodeBlock(code: string, language?: string): string {
  const lang = String(language || '').trim();
  return ['```' + lang, code, '```'].join('\n');
}

function buildAuthorityCodeMessage(
  status: AcmIdeCodeStatus,
  code: string,
  language?: string,
): string {
  if (status === 'empty') {
    return [
      '【当前 IDE 代码】',
      '状态：EMPTY（刚从 IDE 实时读取）',
      '编辑器当前为空，没有任何代码。',
      '硬性约束：',
      '1. 禁止使用、复述、续写历史对话中的任何旧代码；',
      '2. 禁止假设用户仍保留上一轮代码；',
      '3. 若用户在问代码问题，应明确说明当前编辑器无代码，请其粘贴或写入后再分析；',
      '4. 可继续回答与题面/算法概念相关、且不依赖用户代码的问题。',
    ].join('\n');
  }
  if (status === 'unavailable') {
    return [
      '【当前 IDE 代码】',
      '状态：UNAVAILABLE（未能读取编辑器）',
      '硬性约束：不得臆造用户代码，不得把历史代码当成当前 IDE 代码。',
      '若用户询问其代码，请说明暂时读不到编辑器内容，请其粘贴代码片段。',
    ].join('\n');
  }
  return [
    '【当前 IDE 代码】',
    '状态：PRESENT（刚从 IDE 实时读取的最新代码）',
    '代码相关判断、行号、片段引用只允许依据下面这份内容；历史对话中的代码一律作废。',
    '请先静默完成可编译性扫一遍（头文件/import、分号、括号、main/入口）：有问题才写入回答；无问题则跳过、不要提「通过」；不要输出检查过程或 thinking。',
    '',
    formatCodeBlock(code, language),
  ].join('\n');
}

function buildCurrentCodeSection(
  status: AcmIdeCodeStatus,
  code: string,
  language: string | undefined,
  hasHistory: boolean,
): string[] {
  if (status === 'empty') {
    return [
      '',
      '## 当前代码',
      '状态：EMPTY — 编辑器此刻为空。',
      '历史中的代码片段已全部作废，不得再引用。',
      '若问题依赖用户代码，请直接告知当前无代码。',
    ];
  }
  if (status === 'unavailable') {
    return [
      '',
      '## 当前代码',
      '状态：UNAVAILABLE — 未能读取 IDE。',
      '不得使用历史旧代码代替；可请用户粘贴代码。',
    ];
  }
  return [
    '',
    '## 当前代码',
    hasHistory
      ? '以下与上一【当前 IDE 代码】消息相同，均为此刻 IDE 实时内容；历史中的代码片段已作废。'
      : '审查时请先静默做可编译性扫一遍：有问题才写出，无问题则跳过、不要提「通过」；不要输出检查过程或 thinking。',
    formatCodeBlock(code, language),
  ];
}

function rewriteQuestionForModel(
  question: string,
  shortRecheck: boolean,
  status: AcmIdeCodeStatus,
): string {
  if (!shortRecheck) return question;

  if (status === 'empty') {
    return [
      '【任务类型：代码状态确认】',
      '本轮 IDE 编辑器为空。面向用户作答，禁止提及内部标记。',
      '必须明确说明：当前编辑器没有代码，因此无法基于「上一版代码」继续诊断。',
      '可简要说明：若要继续检查，请先把代码写回编辑器或粘贴到对话中。',
      '不要复述或分析历史里出现过的旧代码。',
      '',
      `用户原话：${question}`,
    ].join('\n');
  }

  if (status === 'unavailable') {
    return [
      '【任务类型：代码状态确认】',
      '本轮未能读取 IDE。面向用户说明暂时看不到编辑器代码，请其粘贴代码后再分析。',
      '不要使用历史旧代码冒充当前代码。',
      '',
      `用户原话：${question}`,
    ].join('\n');
  }

  return [
    '【任务类型：代码复核】',
    '对照【当前 IDE 代码】重新判断。面向用户作答，禁止提及「快照」「权威」「过时警告」「内部标记」等字样。',
    '',
    '输出格式必须如下：',
    '',
    '## 开头',
    '用 1～2 句话说明：相对上次讨论，当前代码整体如何（例如：上次认为没问题，但当前仍有编译错误；或上次指出的问题已修好；或仍有以下问题）。',
    '',
    '## 逐项核对',
    '仅提取上次真正指出过的具体缺陷（缺括号、错误逻辑、复杂度不足等），最多 5 条。',
    '若上次结论是「没问题 / 逻辑正确」，不要把它写成一条「已修复」的问题。',
    '每条固定三行：',
    '### 问题：……',
    '状态：仍存在 | 已修复',
    '依据：……（当前代码的行号或片段，不要解释“基于旧代码”这类元原因）',
    '',
    '## 新发现问题（可选）',
    '当前代码有、但上次未提过的问题，写在这里。',
    '',
    '## 总评',
    '一句结论 + 简要修法。',
    '',
    `用户原话：${question}`,
  ].join('\n');
}

function annotateHistoryForStaleCode(
  history: AssistantHistoryMessage[],
): AssistantHistoryMessage[] {
  return history.map((item) => {
    if (item.role !== 'assistant') return item;
    const body = stripCodeFencesFromHistoryContent(
      item.content.startsWith(STALE_HISTORY_PREFIX)
        ? item.content.slice(STALE_HISTORY_PREFIX.length).replace(/^\n/, '')
        : item.content,
    );
    return {
      role: item.role,
      content: `${STALE_HISTORY_PREFIX}\n${body}`,
    };
  });
}

function resolveIdeStatus(ctx: BuiltAcmAssistantContext): AcmIdeCodeStatus {
  if (ctx.ideCodeStatus) return ctx.ideCodeStatus;
  const code = String(ctx.currentCode ?? '').trim();
  if (code) return 'present';
  if (ctx.currentCode === '') return 'empty';
  return 'unavailable';
}

export function buildAcmAssistantMessages(input: {
  ctx: BuiltAcmAssistantContext;
  question: string;
  quote?: AssistantQuote | null;
  history?: AssistantHistoryMessage[];
  codeLanguage?: string;
  deepThink?: boolean;
}) {
  const { ctx, question, quote, history = [], codeLanguage } = input;
  const trimmedHistory = slideAssistantHistoryWindow(history);
  const hasHistory = trimmedHistory.length > 0;
  const ideCodeStatus = resolveIdeStatus(ctx);
  const currentCode = ideCodeStatus === 'present' ? String(ctx.currentCode || '').trim() : '';
  // 空编辑器 / 读不到时，短追问也要走状态确认，避免复读历史诊断
  const shortRecheck = hasHistory && isShortCodeRecheckQuestion(question);
  const lang = codeLanguage || ctx.codeLanguage;

  const statusSystemLine = ideCodeStatus === 'present'
    ? '本轮 IDE 状态：PRESENT（有最新代码）。涉及代码必须只看本轮代码块。'
    : ideCodeStatus === 'empty'
      ? '本轮 IDE 状态：EMPTY（编辑器为空）。禁止使用历史旧代码；代码问题须告知当前无代码。'
      : '本轮 IDE 状态：UNAVAILABLE（未能读取）。禁止臆造或沿用历史代码。';

  const systemParts = [
    ACM_SYSTEM_RULES,
    '',
    `可用能力：${ctx.availableCapabilities.join(', ') || '无'}`,
    ...(lang ? [`当前编程语言：${lang}`] : []),
    statusSystemLine,
    ...(input.deepThink
      ? ['深度思考：已启用，请更细致推理后再回答；推理过程不得写入用户可见正文。']
      : []),
  ];

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemParts.join('\n') },
  ];

  // 只要有历史，就剥离旧代码块——尤其是 EMPTY 时更关键
  const historyForModel = hasHistory
    ? annotateHistoryForStaleCode(trimmedHistory)
    : trimmedHistory;
  for (const item of historyForModel) {
    messages.push({ role: item.role, content: item.content });
  }

  // 追问轮：无论有码/空/不可用，都注入权威 IDE 状态回合，阻断历史旧代码
  if (hasHistory) {
    messages.push({
      role: 'user',
      content: buildAuthorityCodeMessage(ideCodeStatus, currentCode, lang),
    });
    messages.push({
      role: 'assistant',
      content: ideCodeStatus === 'empty'
        ? AUTHORITY_ACK_EMPTY
        : ideCodeStatus === 'unavailable'
          ? '已确认：当前读不到编辑器代码，不会使用历史旧代码。'
          : AUTHORITY_ACK_PRESENT,
    });
  }

  const userParts = ['【服务端重建的 ACM 题目上下文】', ctx.contextBlock];
  userParts.push(...buildCurrentCodeSection(ideCodeStatus, currentCode, lang, hasHistory));

  // 划词：编辑器为空时仍可带引用，但标明这不是完整 IDE 代码
  if (quote?.content && ctx.permissions.resource.canReadStatement) {
    userParts.push('', '【用户引用】', quote.content);
    if (quote.language) userParts.push(`【引用代码语言】${quote.language}`);
    if (ideCodeStatus === 'empty') {
      userParts.push('【说明】当前 IDE 为空；上述引用只是用户选区，不是编辑器全文。');
    }
  }

  userParts.push('', '【用户问题】', rewriteQuestionForModel(question, shortRecheck, ideCodeStatus));
  messages.push({ role: 'user', content: userParts.join('\n') });
  return messages;
}

export function buildAcmSuggestedQuestions(input: {
  runtimeStatus?: string;
}): string[] {
  const status = String(input.runtimeStatus || '').toLowerCase();
  if (status.includes('compile') || status.includes('编译')) {
    return ['帮我分析这次编译错误', '当前语言与代码哪里不匹配？'];
  }
  if (status.includes('wrong') || status.includes('答案')) {
    return ['结合题面、样例和代码分析为什么答案错误', '这个算法能通过数据范围吗？'];
  }
  if (status.includes('runtime') || status.includes('运行')) {
    return ['这次运行时错误可能发生在哪里？', '帮我分析当前代码为什么无法通过'];
  }
  if (status.includes('time') || status.includes('超时')) {
    return ['当前代码为什么会超时，应该如何优化？', '有没有更优复杂度？'];
  }
  return [
    '这道题适合使用什么算法？',
    '这个算法能通过当前数据范围吗？',
    '帮我分析当前代码为什么无法通过',
  ];
}
