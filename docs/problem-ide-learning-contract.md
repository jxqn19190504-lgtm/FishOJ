# ProblemIde 教学扩展协议

ProblemIde 是教学插件宿主。`LearningScaffold` / `AiTutor` **禁止** `import` ProblemIde 内部文件。

## UiContext

ProblemIde 默认写入：

```ts
UiContext.learning = { scaffoldEnabled: false, tutorEnabled: false }
UiContext.problemIdeHost = { pid, docId, domainId, title }
```

其它插件用 `handler/after` 且仅在 `template === 'problem_ide.html'` 时改这些公开字段。

## 浏览器快照

```js
window.FishOJProblemIde.getSnapshot()
window.FishOJProblemIde.hasMeaningfulCode()
```

## document CustomEvent

| 事件 | 方向 | 用途 |
|------|------|------|
| `problem-ide-ready` | IDE → | 编辑器就绪 |
| `problem-ide-code-change` | IDE → | 代码变更（debounce） |
| `problem-ide-language-change` | IDE → | 语言切换 |
| `problem-ide-run-start` | IDE → | 自测开始 |
| `problem-ide-run-result` | IDE → | 自测结束（含 input/expected/stdout/status） |
| `problem-ide-submit-result` | IDE → | 正式提交结束 |
| `problem-ide-fill-pretest-case` | 任意 → IDE | 填充自测 |
| `problem-ide-run-request` | 任意 → IDE | 触发自测 |
| `problem-ide-apply-code` | 任意 → IDE | 写入编辑器；有学生代码且 `force` 不为 true 则拒绝 |
| `problem-ide-apply-code-blocked` | IDE → | 拒绝静默覆盖 |
| `problem-ide-hint-request` | 任意 → Tutor | 请求提示 |
| `problem-ide-scaffold-request` | 任意 → Scaffold | 打开学习方式 / 指定 mode |

Judge 与编辑器不等待 AI。AI 失败不得影响提交。
