/**
 * assistant-text-utils 单元测试
 * 运行：npx ts-node --transpile-only codefun2000.CodeNote/AIAssistant/backend/assistant-text-utils.test.ts
 */
import assert from 'assert';
import { UNRELATED_QUESTION_REPLY } from '../shared/assistant-constants';
import {
  isExactUnrelatedReply,
  normalizeAssistantPlainText,
  unrelatedReplyHtml,
} from './assistant-text-utils';

function runTests() {
  assert.strictEqual(UNRELATED_QUESTION_REPLY, '我只可以回答算法编程、当前笔记和本站功能相关的问题哦');

  assert.strictEqual(isExactUnrelatedReply(UNRELATED_QUESTION_REPLY), true);
  assert.strictEqual(isExactUnrelatedReply(`  ${UNRELATED_QUESTION_REPLY}  `), true);
  assert.strictEqual(isExactUnrelatedReply(`**${UNRELATED_QUESTION_REPLY}**`), true);
  assert.strictEqual(
    isExactUnrelatedReply('<p>我只可以回答算法编程、当前笔记和本站功能相关的问题哦</p>'),
    true,
  );

  assert.strictEqual(isExactUnrelatedReply('问题与当前笔记内容无关联。'), false);
  assert.strictEqual(isExactUnrelatedReply(`${UNRELATED_QUESTION_REPLY}。`), true);
  assert.strictEqual(isExactUnrelatedReply(`「${UNRELATED_QUESTION_REPLY}」`), true);
  assert.strictEqual(isExactUnrelatedReply(`## 结论\n\n${UNRELATED_QUESTION_REPLY}`), false);

  assert.ok(unrelatedReplyHtml().includes(UNRELATED_QUESTION_REPLY));
  assert.ok(!unrelatedReplyHtml().includes('<script'));

  assert.strictEqual(normalizeAssistantPlainText('a\n\nb'), 'a\nb');

  console.log('[assistant-text-utils] tests passed');
}

if (require.main === module) {
  runTests();
}

export { runTests };
