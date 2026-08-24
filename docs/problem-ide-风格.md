# FishOJ 做题页视觉风格

来源：codefun2000 ProblemPages。作用范围：`html.page--problem_ide`。Hydro 顶栏 46px 保留，页脚关掉，内容区铺满剩余视口。样式文件：`addons/ProblemIde/frontend/problem_ide.css`。

## 一句话

Ant Design 4 色板的 LeetCode 式在线编译器：左白题面、右深色编辑器、底栏控制台。强调蓝 `#1890ff`，提交绿 `#52c41a`。不是 Hydro 默认「文章流 + 下方提交框」。

## 版式

| 层 | 规则 |
| --- | --- |
| 视口 | 根节点 `position: fixed`，`top: 46px`，高 `calc(100vh - 46px)` |
| 滚动 | `html`/`body` `overflow: hidden`；只滚题面、编辑器、控制台内部 |
| 横向 | 左题面 \| 5px 拖拽分隔 \| 右 IDE；窄屏题面可收到约 5% |
| 纵向（右侧） | 工具栏 + Monaco + 可拉高的底栏（用例 / 结果 / 历史） |
| 页脚 | `.footer { display: none }` |

## 色板

**亮色（默认）**

- 页面底 `#f0f2f5`
- 题面卡片、Tab 栏、工具栏 `#fff`
- 边线 `#e8e8e8`
- 正文偏 `#262626`
- 分隔条悬停变蓝

**暗色**

- 跟站点 `html.theme--dark`，不是独立主题开关
- Tab 与边线改到 `#333` 一带，链接悬停 `#69b1ff`
- 编辑器区始终偏 VS Code 深色 `#1e1e1e`

| 角色 | 色值 | 用在哪 |
| --- | --- | --- |
| 强调 / 运行 | `#1890ff` | Tab 顶边、分隔条、运行按钮、焦点描边、加载圈 |
| 运行 hover / active | `#40a9ff` / `#096dd9` | 运行按钮 |
| 提交 | `#52c41a` | 提交按钮（不是蓝） |
| 提交 hover / active | `#73d13d` / `#389e0d` | 提交按钮 |
| 通过 | `#52c41a` | AC / ACM 标签 |
| 失败 | Hydro 红系（`#ff4d4f` 一带） | WA / 错误结果 |
| 禁用 | `opacity: .5` | 未登录运行/提交 |

## 字体与圆角

| 用途 | 规格 |
| --- | --- |
| 题面正文 | Noto Sans SC / PingFang / 微软雅黑等无衬线 |
| 代码与用例 | Consolas / Monaco / Courier；工具栏数字用 `ui-monospace` |
| Tab | 12px，无圆角，激活态顶边 2px 蓝 |
| 下拉 / 设置 | 12–13px，圆角 4px，hover 边框变蓝 |
| 运行 / 提交 | 高 28px，左右 20px，圆角 4px，字重 500 |
| 题面标题 | 约 1.35em，比 Hydro 默认题页更紧 |

## 交互节奏

过渡普遍 0.15–0.35s。控件 hover 只改边框或背景，不做大阴影。焦点是蓝描边 + `rgba(24,144,255,.15)` 外圈。

加载：全屏半透明白底 + 44px 蓝圈；右侧 IDE 未就绪时盖一层 `#1e1e1e`。

## 和 Hydro 默认题页的差别

| 默认 `/p/:pid` | IDE `/ide/:pid` |
| --- | --- |
| 题面在上、提交在下，整页滚动 | 左右并排，一屏铺满 |
| 页脚露出 | 页脚隐藏 |
| textarea / scratchpad | Monaco，无 minimap |
| 提交即走官方表单流 | 底栏自测 + 右侧提交，未登录按钮灰掉 |

## 尚未接线、但 CSS 已有的外观

会员冷却横幅、题库抽屉、计时器的规则写在同一份 `problem_ide.css` 里，当前页面没有对应 DOM。
