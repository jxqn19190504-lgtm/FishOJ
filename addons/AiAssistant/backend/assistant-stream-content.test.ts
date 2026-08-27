/**
 * assistant-stream-content 单元测试
 * 运行：esbuild ... --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
 */
import assert from 'assert';
import {
  assistantThinkingPlaceholderHtml,
  resolveAssistantStreamMarkdown,
  stripAssistantThinkingTags,
} from './assistant-stream-content';
import { ASSISTANT_THINKING_PLACEHOLDER_HTML } from '../shared/assistant-constants';

function runTests() {
  assert.strictEqual(assistantThinkingPlaceholderHtml(), ASSISTANT_THINKING_PLACEHOLDER_HTML);
  assert.ok(assistantThinkingPlaceholderHtml(true).includes('深度思考中，请稍候'));
  assert.ok(ASSISTANT_THINKING_PLACEHOLDER_HTML.includes('cf-assistant-thinking-dots'));
  assert.ok(ASSISTANT_THINKING_PLACEHOLDER_HTML.includes('AI思考中，请稍候'));

  const thinkClose = '</' + 'redacted_thinking>';
  const thinkOpen = '<' + 'redacted_thinking>';
  const thinkingOnly = resolveAssistantStreamMarkdown(`${thinkOpen}我们注意到用户问的是…`);
  assert.strictEqual(thinkingOnly.phase, 'thinking');
  assert.strictEqual(thinkingOnly.markdown, '');

  const answer = resolveAssistantStreamMarkdown(
    `${thinkOpen}内部分析${thinkClose}\n\n## 结论\n\n这是答案`,
  );
  assert.strictEqual(answer.phase, 'answer');
  assert.ok(answer.markdown.startsWith('## 结论'));

  assert.strictEqual(
    stripAssistantThinkingTags(`${thinkOpen}隐藏${thinkClose}\n\n正文`),
    '正文',
  );

  const analysisOpen = '<' + 'analysis>';
  const analysisClose = '</' + 'analysis>';
  assert.strictEqual(
    stripAssistantThinkingTags(`${analysisOpen}内部分析${analysisClose}\n\n## 结论\n答案`),
    '## 结论\n答案',
  );
  const analysisOnly = resolveAssistantStreamMarkdown(`${analysisOpen}还在写…`);
  assert.strictEqual(analysisOnly.phase, 'thinking');
  assert.strictEqual(analysisOnly.markdown, '');

  assert.strictEqual(
    stripAssistantThinkingTags('【思考】一步步推\n【回答】\n## 结论\n好的'),
    '## 结论\n好的',
  );

  console.log('[assistant-stream-content] tests passed');
}

if (require.main === module) {
  runTests();
}

export { runTests };
