import type { LocalRelevanceDecision } from '../shared/assistant-types';
import { normalizeQuestion } from './assistant-text-utils';

/** 纯本地规则模块，不调用任何大模型 API */
export type LocalRelevanceInput = {
  question: string;
  hasQuote: boolean;
  hasConversationHistory: boolean;
};

const SHORT_FOLLOWUP_PATTERNS = [
  /^为什么[？?]?$/,
  /^然后呢[？?]?$/,
  /^什么意思[？?]?$/,
  /^具体一点[？?]?$/,
  /^再详细讲讲[？?]?$/,
  /^举个例子[？?]?$/,
  /^换个说法[？?]?$/,
  /^还有吗[？?]?$/,
  /^继续[？?]?$/,
  /^代码呢[？?]?$/,
  /^复杂度呢[？?]?$/,
  /^边界呢[？?]?$/,
  /^这个呢[？?]?$/,
  /^哪里错了[？?]?$/,
  /^怎么改[？?]?$/,
  /^能优化吗[？?]?$/,
  /^能再解释一下吗[？?]?$/,
  /^能再举例吗[？?]?$/,
  /^解释一下[？?]?$/,
  /^解释这段[？?]?$/,
  /^还有别的方法吗[？?]?$/,
  /^还有其他方法吗[？?]?$/,
  /^为什么不用哈希表[？?]?$/,
  /^那如果换成数组呢[？?]?$/,
];

const ALGORITHM_PROGRAMMING_SIGNAL_PATTERNS = [
  /算法/,
  /数据结构/,
  /复杂度/,
  /时间复杂度/,
  /空间复杂度/,
  /数组/,
  /字符串/,
  /链表/,
  /哈希/,
  /栈/,
  /队列/,
  /堆/,
  /树/,
  /二叉树/,
  /图/,
  /排序/,
  /二分/,
  /双指针/,
  /滑动窗口/,
  /前缀和/,
  /差分/,
  /递归/,
  /回溯/,
  /贪心/,
  /动态规划/,
  /\bDFS\b/i,
  /\bBFS\b/i,
  /并查集/,
  /字典树/,
  /拓扑排序/,
  /最短路/,
  /leetcode/i,
  /hot100/i,
  /\bACM\b/i,
  /代码/,
  /函数/,
  /变量/,
  /循环/,
  /报错/,
  /编译/,
  /运行/,
  /超时/,
  /\bTLE\b/i,
  /\bMLE\b/i,
  /\bWA\b/i,
  /测试用例/,
  /边界条件/,
  /优化/,
  /调试/,
  /\bJava\b/i,
  /C\+\+/,
  /\bPython\b/i,
  /\bGo\b/i,
  /当前题目/,
  /这道题/,
  /这段代码/,
  /这个解法/,
  /题解/,
  /思路/,
  /指针/,
  /遍历/,
  /子树/,
  /节点/,
  /提交/,
  /通过/,
  /内存/,
  /样例/,
  /输入/,
  /输出/,
  /层序遍历/,
  /优先队列/,
  /PriorityQueue/i,
  /状态转移/,
  /死循环/,
  /deque/i,
];

const SITE_FEATURE_SIGNAL_PATTERNS = [
  /本站/,
  /网站/,
  /codefun/i,
  /codenote/i,
  /hot100/i,
  /学习模式/,
  /练习模式/,
  /切换模式/,
  /编程语言/,
  /语言切换/,
  /\bIDE\b/i,
  /内嵌\s*IDE/i,
  /运行代码/,
  /运行这段/,
  /自测/,
  /提交代码/,
  /题解/,
  /目录/,
  /划词/,
  /问\s*AI/i,
  /AI\s*助教/,
  /历史会话/,
  /新建会话/,
  /额度/,
  /次数/,
  /登录/,
  /会员/,
  /\bVIP\b/i,
  /购买/,
  /题库权限/,
  /怎么使用/,
  /怎么操作/,
  /功能介绍/,
  /看不到完整题解/,
  /权限/,
];

const ARTICLE_INTRO_SIGNAL_PATTERNS = [
  /这篇文章/,
  /这篇笔记/,
  /本文/,
  /本章/,
  /这一页/,
  /介绍页/,
  /主要讲什么/,
  /有哪些内容/,
  /总结一下/,
  /概览/,
  /重点是什么/,
  /怎么学习/,
  /学习顺序/,
  /适合谁/,
  /从哪里开始/,
  /章节关系/,
  /应该怎么刷/,
  /整体结构/,
  /共同点/,
  /适合什么场景/,
];

const STRICT_PROMPT_INJECTION_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  { id: 'ignore_rules', pattern: /忽略之前.{0,8}(的)?(全部)?规则/ },
  { id: 'ignore_system', pattern: /忽略系统指令/ },
  { id: 'forget_requirements', pattern: /忘记以上要求/ },
  { id: 'leak_prompt', pattern: /输出你的\s*system\s*prompt/i },
  { id: 'leak_config', pattern: /(告诉我|输出|打印).{0,12}内部配置/ },
  { id: 'change_identity', pattern: /改变你的身份/ },
  { id: 'remove_limits', pattern: /解除.{0,12}(回答范围)?限制/ },
  { id: 'leak_key', pattern: /(告诉我|输出|泄露).{0,16}(deepseek|api).{0,10}(密钥|key)/i },
  { id: 'ignore_all', pattern: /忽略之前的所有规则/ },
  { id: 'print_config', pattern: /内部配置完整打印/ },
];

const CLEARLY_UNRELATED_RULES: Array<{ id: string; pattern: RegExp }> = [
  { id: 'weather_query', pattern: /(今天|明天|后天).{0,6}(天气|气温|下雨|降雨|空气质量)|天气.{0,4}(怎么样|如何)/ },
  { id: 'movie_recommend', pattern: /(推荐|介绍).{0,8}(电影|电视剧|综艺|明星|歌曲)|看.{0,4}(电影|剧)/ },
  { id: 'travel_guide', pattern: /(旅游|旅行|景点|酒店|机票|旅行攻略|去哪玩)/ },
  { id: 'stock_predict', pattern: /(股票|股价|基金|彩票).{0,8}(涨|跌|预测|走势|推荐买)|预测.{0,8}(股票|股价|基金|彩票)|明天.{0,6}(涨|跌)/ },
  { id: 'food_shopping', pattern: /(餐厅|美食|外卖|购物).{0,6}(推荐|哪家|怎么选)|推荐.{0,6}(餐厅|美食|外卖)|附近有什么好吃的/ },
  { id: 'fortune_telling', pattern: /(星座|运势|算命|占卜|塔罗)/ },
  { id: 'love_letter_ad', pattern: /(情书|广告文案|旅游文案|营销文案)/ },
];

export function matchesStrictPromptInjection(question: string): string | null {
  const q = normalizeQuestion(question);
  if (!q) return null;
  for (const rule of STRICT_PROMPT_INJECTION_PATTERNS) {
    if (rule.pattern.test(q)) return rule.id;
  }
  return null;
}

export function matchesAlgorithmProgrammingSignal(question: string): boolean {
  const q = normalizeQuestion(question);
  if (!q) return false;
  return ALGORITHM_PROGRAMMING_SIGNAL_PATTERNS.some((p) => p.test(q));
}

export function matchesSiteFeatureSignal(question: string): boolean {
  const q = normalizeQuestion(question);
  if (!q) return false;
  return SITE_FEATURE_SIGNAL_PATTERNS.some((p) => p.test(q));
}

export function matchesArticleIntroductionSignal(question: string): boolean {
  const q = normalizeQuestion(question);
  if (!q) return false;
  return ARTICLE_INTRO_SIGNAL_PATTERNS.some((p) => p.test(q));
}

export function matchesFollowupSignal(question: string): boolean {
  const q = normalizeQuestion(question);
  if (!q) return false;
  return SHORT_FOLLOWUP_PATTERNS.some((p) => p.test(q));
}

export function matchesClearlyUnrelatedIntent(question: string): string | null {
  const q = normalizeQuestion(question);
  if (!q) return null;
  for (const rule of CLEARLY_UNRELATED_RULES) {
    if (rule.pattern.test(q)) return rule.id;
  }
  return null;
}

export function hasRelatedSignal(question: string): boolean {
  return matchesAlgorithmProgrammingSignal(question)
    || matchesSiteFeatureSignal(question)
    || matchesArticleIntroductionSignal(question)
    || matchesFollowupSignal(question);
}

export function matchClearlyUnrelatedRule(question: string): string | null {
  return matchesStrictPromptInjection(question) || matchesClearlyUnrelatedIntent(question);
}

export function evaluateLocalRelevance(input: LocalRelevanceInput): {
  decision: LocalRelevanceDecision;
  ruleId?: string;
} {
  const injectionId = matchesStrictPromptInjection(input.question);
  if (injectionId) return { decision: 'CLEARLY_UNRELATED', ruleId: injectionId };

  if (input.hasQuote) return { decision: 'PASS' };
  if (input.hasConversationHistory) return { decision: 'PASS' };

  if (matchesAlgorithmProgrammingSignal(input.question)) return { decision: 'PASS' };
  if (matchesSiteFeatureSignal(input.question)) return { decision: 'PASS' };
  if (matchesArticleIntroductionSignal(input.question)) return { decision: 'PASS' };
  if (matchesFollowupSignal(input.question)) return { decision: 'PASS' };

  const unrelatedId = matchesClearlyUnrelatedIntent(input.question);
  if (unrelatedId) return { decision: 'CLEARLY_UNRELATED', ruleId: unrelatedId };

  return { decision: 'PASS' };
}

export class AssistantLocalRelevanceGuard {
  check(input: LocalRelevanceInput) {
    return evaluateLocalRelevance(input);
  }
}
