/**
 * Prompt / 输出格式 Policy 快照测试
 * 运行：npx ts-node --transpile-only codefun2000.CodeNote/AIAssistant/backend/AssistantOutputFormatPolicy.test.ts
 */
import assert from 'assert';
import { UNRELATED_QUESTION_REPLY } from '../shared/assistant-constants';
import {
  buildAssistantOutputFormatPolicy,
  buildAssistantSystemPrompt,
  buildModePolicy,
  buildResponseDepthPolicy,
  buildUnrelatedQuestionPolicy,
} from './AssistantOutputFormatPolicy';
import type { BuiltAssistantContext } from './AssistantContextBuilder';
import { buildAssistantMessages } from './AssistantPromptBuilder';

const mockCtx: BuiltAssistantContext = {
  title: '两数之和',
  pid: 'P1000',
  psid: 'mock',
  abbreviation: 'hot100',
  mode: 'learning',
  isIntroPage: false,
  canSeeSolution: true,
  isReadLimited: false,
  canReadStatement: true,
  contextBlock: '# 页面信息\n- 标题：两数之和',
};

function runTests() {
  const unrelated = buildUnrelatedQuestionPolicy();
  assert.ok(unrelated.includes(UNRELATED_QUESTION_REPLY));
  assert.ok(unrelated.includes('最高优先级'));

  const format = buildAssistantOutputFormatPolicy();
  assert.ok(format.includes('## 核心结论'));
  assert.ok(format.includes('## 这篇笔记讲什么'));
  assert.ok(format.includes('## 操作方法'));
  assert.ok(format.includes('不要 JSON'));
  assert.ok(!format.includes('该简洁时简洁'));

  const depthIntro = buildResponseDepthPolicy('这篇文章主要讲什么？', { ...mockCtx, isIntroPage: true });
  assert.ok(depthIntro.includes('介绍') || depthIntro.includes('学习路径'));

  const depthShort = buildResponseDepthPolicy('为什么？', mockCtx, { hasConversationHistory: true });
  assert.ok(depthShort.includes('连续追问'));

  const depthDetail = buildResponseDepthPolicy('详细讲讲动态规划', mockCtx);
  assert.ok(depthDetail.includes('详细'));

  const system = buildAssistantSystemPrompt(mockCtx, '这道题的核心思路是什么？');
  assert.ok(system.includes('Hot100'));
  assert.ok(system.includes('算法编程学习助教'));
  assert.ok(system.includes(UNRELATED_QUESTION_REPLY));
  assert.ok(system.includes('通用算法编程问题'));
  assert.ok(system.includes('本站功能'));
  assert.ok(system.includes('用户意图优先'));

  const practiceSystem = buildAssistantSystemPrompt(
    { ...mockCtx, mode: 'practice', canSeeSolution: false },
    '动态规划和贪心有什么区别？',
  );
  assert.ok(practiceSystem.includes('practice'));
  assert.ok(practiceSystem.includes('通用算法知识'));
  assert.ok(practiceSystem.includes('不要展开当前题目解题步骤') || practiceSystem.includes('禁止主动给出本题思路') || practiceSystem.includes('用户意图优先'));
  assert.ok(!practiceSystem.includes('不得回答'));

  const depthGeneral = buildResponseDepthPolicy('动态规划和贪心有什么区别？', mockCtx);
  assert.ok(depthGeneral.includes('通用算法知识'));
  assert.ok(depthGeneral.includes('不要展开当前题目'));

  const practiceMode = buildModePolicy('practice', '给我一个提示');
  assert.ok(practiceMode.includes('渐进式提示'));
  assert.ok(practiceMode.includes('完整正常回答'));

  const messages = buildAssistantMessages({
    ctx: mockCtx,
    question: '为什么要用哈希表？',
    history: [{ role: 'user', content: '上一问' }],
  });
  assert.strictEqual(messages[0].role, 'system');
  assert.ok(messages[0].content.includes('输出格式'));
  assert.strictEqual(messages[messages.length - 1].role, 'user');
  assert.ok(messages[messages.length - 1].content.includes('【用户问题】'));
  assert.ok(!messages[messages.length - 1].content.includes('## 结论'));

  console.log('[AssistantOutputFormatPolicy] tests passed');
}

if (require.main === module) {
  runTests();
}

export { runTests };
