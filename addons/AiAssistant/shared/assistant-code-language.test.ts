import assert from 'assert';
import {
  dedupeAssistantLanguageOptions,
  normalizeCodeLanguage,
  resolveNativeLanguageKey,
} from './assistant-code-language';

assert.strictEqual(normalizeCodeLanguage('py.py3'), 'python');
assert.strictEqual(normalizeCodeLanguage('py.py2'), 'python');
assert.strictEqual(normalizeCodeLanguage('py.pypy3'), 'python');
assert.strictEqual(normalizeCodeLanguage('Python'), 'python');
assert.strictEqual(normalizeCodeLanguage('cc.cc17'), 'cpp');
assert.strictEqual(normalizeCodeLanguage('cc.cc14o2'), 'cpp');
assert.strictEqual(normalizeCodeLanguage('c'), 'c');
assert.strictEqual(normalizeCodeLanguage('c.c99'), 'c');

const deduped = dedupeAssistantLanguageOptions([
  { label: 'Python', value: 'py' },
  { label: 'Python 2', value: 'py.py2' },
  { label: 'Python 3', value: 'py.py3' },
  { label: 'PyPy3', value: 'py.pypy3' },
  { label: 'C++17', value: 'cc.cc17' },
  { label: 'C++14', value: 'cc.cc14' },
]);
assert.deepStrictEqual(deduped.map((o) => o.value), ['cpp', 'python']);
assert.deepStrictEqual(deduped.map((o) => o.label), ['C++', 'Python']);

const keys = ['py', 'py.py2', 'py.py3', 'py.pypy3', 'cc.cc14', 'cc.cc17'];
assert.strictEqual(resolveNativeLanguageKey('python', keys), 'py.py3');
assert.strictEqual(resolveNativeLanguageKey('python', keys, 'py.py2'), 'py.py2');
assert.strictEqual(resolveNativeLanguageKey('cpp', keys), 'cc.cc17');
assert.strictEqual(resolveNativeLanguageKey('py.py3', keys), 'py.py3');

console.log('assistant-code-language.test.ts: ok');
