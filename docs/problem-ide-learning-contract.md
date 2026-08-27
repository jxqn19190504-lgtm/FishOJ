# ProblemIde 教学扩展协议

ProblemIde 是教学插件宿主。`LearningScaffold` / `AiTutor` / `AiAnalysis` / `AiAssistant` **禁止** `import` ProblemIde 内部文件。

## UiContext

ProblemIde 默认写入：

```ts
UiContext.learning = { scaffoldEnabled: false, tutorEnabled: false, assistantEnabled: false }
UiContext.problemIdeHost = { pid, docId, domainId, title }
```

其它插件用 `handler/after` 且仅在 `template === 'problem_ide.html'` 时改这些公开字段。

`AiAssistant` 还会写入 `UiContext.aiAssistant`（见下文）。

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
| `problem-ide-ai-analysis-open` | 任意 → AiAnalysis | 打开 AI 分析面板；`detail: { rid, rdoc? }` |

## AiAnalysis（`addons/AiAnalysis`）

`handler/after`（仅 `problem_ide.html`）写入：

```ts
UiContext.aiAnalysis = {
  enabled: true,
  streamUrl: '/ai-analysis/stream',
  cacheUrl: '/ai-analysis/cache',
  quotaUrl: '/ai-analysis/quota',
  canUseCustomApiKey: boolean, // 管理员或 ideShortCooldown（会员）
  quota: { limited, remaining, dailyLimit, unlimited?, source: 'daily_count' },
}
```

路由：`POST /ai-analysis/stream`（SSE）、`GET /ai-analysis/cache?rid=`、`GET /ai-analysis/quota`。

`problem-ide-submit-result` 的 `detail` 可含 `rid` / `rdoc`，供「运行结果」旁 AI 按钮使用。

Judge 与编辑器不等待 AI。AI 失败不得影响提交。

## AiAssistant（`addons/AiAssistant`）

多轮 LLM 聊天助教（浮层），与 `AiTutor`（启发式 `/ai-tutor/hint`）职责不同。

`handler/after`（仅 `problem_ide.html`）写入：

```ts
UiContext.aiAssistant = {
  enabled: boolean, // 登录用户为 true
  streamUrl: '/ai-assistant/stream',
  historyUrl: '/ai-assistant/history',
  scene: 'acm-problem',
}
UiContext.learning.assistantEnabled = boolean // 与 aiAssistant.enabled 同步
```

路由：`POST /ai-assistant/stream`（SSE）、`GET /ai-assistant/history`、`GET /ai-assistant/history/:id`、`POST /ai-assistant/acm/capability`。

前端通过 `problemIdeAssistantBridge` 读取 `window.FishOJProblemIde.getSnapshot()`，监听 `problem-ide-*` 事件；挂载路由匹配 `/ide/:pid` 或 `page_name=problem_ide`。
