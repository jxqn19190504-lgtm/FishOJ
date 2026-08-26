/**
 * ACM 共享层单元测试
 * 运行：npx ts-node --transpile-only shared/acm/acm-assistant.test.ts
 */
import assert from 'assert';
import { parseAcmStatementContent } from './acm-statement-parser';
import { isRolloutAllowed, resolveAcmBankPolicy } from './acm-bank-policy';

(function testParseAcmStatement() {
  const md = [
    '## 题目描述',
    '给定字符串 s',
    '',
    '## 输入描述',
    '一行字符串',
    '',
    '## 输出描述',
    '一个整数',
    '',
    '```',
    'abcabcbb',
    '```',
    '',
    '```',
    '3',
    '```',
  ].join('\n');

  const parsed = parseAcmStatementContent(md);
  assert.equal(parsed.description, '给定字符串 s');
  assert.equal(parsed.inputDescription, '一行字符串');
  assert.equal(parsed.outputDescription, '一个整数');
  assert.equal(parsed.examples.length, 1);
  assert.equal(parsed.examples[0].input, 'abcabcbb');
  assert.equal(parsed.examples[0].output, '3');
})();

(function testBankPolicy() {
  const p = resolveAcmBankPolicy({ bankType: 'interview-bank', problemSetAbbr: 'interview' });
  assert.equal(p.access.requireBankEntitlement, true);
  const allow = { ...p, rollout: { mode: 'allowlist' as const, problemIds: ['P0016'] } };
  assert.equal(isRolloutAllowed(allow, 'P0016'), true);
  assert.equal(isRolloutAllowed(allow, 'P9999'), false);
})();

console.log('acm-assistant.test.ts: all passed');
