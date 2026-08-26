/**
 * assistant-history 滑动窗口单元测试
 * 运行：npx esbuild ... --bundle --platform=node | node
 */
import assert from 'assert';
import {
  ASSISTANT_MAX_HISTORY_TURNS,
  ASSISTANT_MAX_HISTORY_MESSAGE_LEN,
  ASSISTANT_MAX_HISTORY_TOTAL_CHARS,
  pairAssistantHistoryTurns,
  slideAssistantHistoryWindow,
} from './assistant-history';

function runTests() {
  assert.strictEqual(ASSISTANT_MAX_HISTORY_TURNS, 5);
  assert.strictEqual(ASSISTANT_MAX_HISTORY_MESSAGE_LEN, 1500);
  assert.strictEqual(ASSISTANT_MAX_HISTORY_TOTAL_CHARS, 8000);

  // 配对：user+assistant 为一轮
  const paired = pairAssistantHistoryTurns([
    { role: 'user', content: 'u1' },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'u2' },
  ]);
  assert.strictEqual(paired.length, 2);
  assert.strictEqual(paired[0].messages.length, 2);
  assert.strictEqual(paired[1].messages.length, 1);

  // 轮次滑动：12 条消息 = 6 轮 → 保留最近 5 轮 = 10 条
  const many = Array.from({ length: 12 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `msg-${i}`,
  }));
  const windowed = slideAssistantHistoryWindow(many);
  assert.strictEqual(windowed.length, 10);
  assert.strictEqual(windowed[0].content, 'msg-2');
  assert.strictEqual(windowed[windowed.length - 1].content, 'msg-11');

  // 单条超长截断
  const longMsg = 'x'.repeat(2000);
  const trimmed = slideAssistantHistoryWindow([{ role: 'user', content: longMsg }]);
  assert.strictEqual(trimmed[0].content.length, ASSISTANT_MAX_HISTORY_MESSAGE_LEN);

  // 总字符预算：从最旧侧整轮滑出
  const overflow = Array.from({ length: 10 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: 'a'.repeat(900),
  }));
  const totalTrimmed = slideAssistantHistoryWindow(overflow);
  const total = totalTrimmed.reduce((s, m) => s + m.content.length, 0);
  assert.ok(total <= ASSISTANT_MAX_HISTORY_TOTAL_CHARS);
  // 滑出后仍从 user 对齐
  assert.ok(!totalTrimmed.length || totalTrimmed[0].role === 'user');

  // orphan assistant 开头被滑掉
  const orphan = slideAssistantHistoryWindow([
    { role: 'assistant', content: 'lonely' },
    { role: 'user', content: 'q' },
    { role: 'assistant', content: 'ans' },
  ]);
  assert.strictEqual(orphan[0].role, 'user');
  assert.strictEqual(orphan.length, 2);

  // 自定义更小窗口
  const tiny = slideAssistantHistoryWindow(many, { maxTurns: 2 });
  assert.strictEqual(tiny.length, 4);
  assert.strictEqual(tiny[0].content, 'msg-8');

  console.log('[assistant-history] sliding window tests passed');
}

if (typeof require !== 'undefined' && require.main === module) {
  runTests();
}

export { runTests };
