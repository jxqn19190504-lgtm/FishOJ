import assert from 'assert';
import {
  buildAcmAssistantMessages,
  isShortCodeRecheckQuestion,
} from './AcmAssistantPromptBuilder';
import type { BuiltAcmAssistantContext } from './AcmAssistantContextBuilder';

function mockCtx(overrides: Partial<BuiltAcmAssistantContext> = {}): BuiltAcmAssistantContext {
  return {
    title: '样例题',
    pid: 'P1000',
    docId: 1,
    domainId: 'system',
    bankType: 'free',
    permissions: {
      resource: {
        canAccessAssistant: true,
        canReadStatement: true,
      },
      capabilities: {
        canReadCode: true,
        canSwitchLanguage: true,
        canReadCustomTest: true,
        canReadOwnRunResult: true,
        canReadOwnConsoleOutput: true,
        canReadOwnSubmissions: false,
        canReadOfficialSolution: false,
      },
      deniedReasons: [],
    } as any,
    availableCapabilities: ['acm.ide.getCurrentCode'],
    contextBlock: '# ACM 编程题上下文\n- 题号：P1000',
    codeLanguage: 'cpp',
    currentCode: 'int main(){ return 0; }',
    ideCodeStatus: 'present',
    ...overrides,
  };
}

function testShortRecheck() {
  assert.strictEqual(isShortCodeRecheckQuestion('现在呢'), true);
  assert.strictEqual(isShortCodeRecheckQuestion('改好了吗'), true);
  assert.strictEqual(isShortCodeRecheckQuestion('我改了代码再看看'), true);
  assert.strictEqual(isShortCodeRecheckQuestion('帮我重新看下代码'), true);
  assert.strictEqual(isShortCodeRecheckQuestion('还是不行'), true);
  assert.strictEqual(isShortCodeRecheckQuestion('WA'), true);
  assert.strictEqual(isShortCodeRecheckQuestion('帮我分析一下时间复杂度'), false);
}

function testAuthorityTurnOnFollowUp() {
  const messages = buildAcmAssistantMessages({
    ctx: mockCtx(),
    question: '现在呢',
    history: [
      { role: 'user', content: '这段代码有什么问题？' },
      { role: 'assistant', content: '第 3 行缺少分号。' },
    ],
    codeLanguage: 'cpp',
  });

  const roles = messages.map((m) => m.role);
  assert.deepStrictEqual(roles.slice(0, 6), [
    'system',
    'user',
    'assistant',
    'user',
    'assistant',
    'user',
  ]);

  const authority = messages[3];
  assert.ok(authority.content.includes('当前 IDE 代码'));
  assert.ok(authority.content.includes('PRESENT'));
  assert.ok(authority.content.includes('int main()'));

  const ack = messages[4];
  assert.ok(ack.content.includes('已收到当前最新代码'));

  const historyAssistant = messages[2];
  assert.ok(historyAssistant.content.includes('内部标记'));

  const finalUser = messages[5];
  assert.ok(finalUser.content.includes('任务类型：代码复核'));
  assert.ok(finalUser.content.includes('## 开头'));
  assert.ok(finalUser.content.includes('不要把它写成一条「已修复」'));
  assert.ok(finalUser.content.includes('用户原话：现在呢'));
  assert.ok(finalUser.content.includes('int main(){ return 0; }'));
  assert.ok(finalUser.content.includes('历史中的代码片段已作废'));
  assert.ok(messages[0].content.includes('IDE 状态：PRESENT'));
  assert.ok(messages[0].content.includes('IDE 代码新鲜度'));
  assert.ok(messages[0].content.includes('通用算法/数据结构/编程知识'));
  assert.ok(messages[0].content.includes('禁止主动给出本题思路'));
  assert.ok(authority.content.includes('有问题才写入回答'));
}

function testEmptyIdeBlocksHistoryCode() {
  const messages = buildAcmAssistantMessages({
    ctx: mockCtx({
      currentCode: '',
      ideCodeStatus: 'empty',
    }),
    question: '现在呢',
    history: [
      { role: 'user', content: '看看我的代码' },
      {
        role: 'assistant',
        content: '你的代码有问题：\n```cpp\nint old(){ return 0; }\n```\n缺分号。',
      },
    ],
    codeLanguage: 'cpp',
  });

  assert.ok(messages[0].content.includes('IDE 状态：EMPTY'));

  const historyAssistant = messages.find(
    (m) => m.role === 'assistant' && m.content.includes('内部标记'),
  );
  assert.ok(historyAssistant);
  assert.ok(historyAssistant!.content.includes('历史代码片段已省略'));
  assert.ok(!historyAssistant!.content.includes('int old()'));

  const authority = messages.find(
    (m) => m.role === 'user' && m.content.includes('状态：EMPTY'),
  );
  assert.ok(authority);
  assert.ok(authority!.content.includes('编辑器当前为空'));
  assert.ok(authority!.content.includes('禁止使用'));

  const finalUser = messages[messages.length - 1];
  assert.ok(finalUser.content.includes('状态：EMPTY'));
  assert.ok(finalUser.content.includes('任务类型：代码状态确认'));
  assert.ok(finalUser.content.includes('编辑器没有代码') || finalUser.content.includes('没有任何代码'));
  // 最终消息不得再出现历史旧代码
  assert.ok(!finalUser.content.includes('int old()'));
}

function testFirstRoundEmbedsCodeInUser() {
  const messages = buildAcmAssistantMessages({
    ctx: mockCtx(),
    question: '帮我看看代码',
    history: [],
    codeLanguage: 'cpp',
  });
  assert.strictEqual(messages.length, 2);
  assert.ok(messages[1].content.includes('## 当前代码'));
  assert.ok(messages[1].content.includes('int main()'));
  assert.ok(messages[1].content.includes('有问题才写出'));
  assert.ok(messages[0].content.includes('头文件'));
}

function testHistoryCodeFencesStripped() {
  const messages = buildAcmAssistantMessages({
    ctx: mockCtx({ currentCode: 'int main(){ return 1; }', ideCodeStatus: 'present' }),
    question: '我改了代码',
    history: [
      { role: 'user', content: '看看这段' },
      {
        role: 'assistant',
        content: '问题在这里：\n```cpp\nint old(){}\n```\n缺少返回值。',
      },
    ],
    codeLanguage: 'cpp',
  });
  const historyAssistant = messages.find(
    (m) => m.role === 'assistant' && m.content.includes('内部标记'),
  );
  assert.ok(historyAssistant);
  assert.ok(historyAssistant!.content.includes('历史代码片段已省略'));
  assert.ok(!historyAssistant!.content.includes('int old()'));
  assert.ok(messages.some((m) => m.content.includes('int main(){ return 1; }')));
}

testShortRecheck();
testAuthorityTurnOnFollowUp();
testEmptyIdeBlocksHistoryCode();
testFirstRoundEmbedsCodeInUser();
testHistoryCodeFencesStripped();
console.log('AcmAssistantPromptBuilder.test.ts OK');
