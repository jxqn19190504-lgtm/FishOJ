# 题面改写能力提炼（来自 ProblemIde/`fix`）

> 日期：2026-08-26。  
> 目的：说清 `addons/ProblemIde/fix/` 是什么、哪些能力值得留在 FishOJ、哪些应剥离。

---

## 1. `fix` 实际是什么

`fix/` **不是** ProblemIde 做题页运行时的一部分，而是一套**线下题库运营脚本**：

| 层 | 内容 |
|---|---|
| 拉取 | 用 Hydro 风格 API 取原题面 / 题解 |
| 改写 | Agent（默认）或 DeepSeek 生成新题面、新样例、适配题解 |
| 拼接 | 按固定 Markdown 骨架组装完整题面 |
| 上传 | 写回平台（原脚本硬编码 CodeFun2000） |

ProblemIde 本体只负责渲染 `pdoc.content`（Markdown → `.markdown-body`）。  
`fix` 与 `LearningScaffold` / `AiTutor` **无运行时耦合**。

---

## 2. 与 FishOJ 契合的能力（应保留）

FishOJ 面向少儿培训班，需要**差异化题库**（同算法核、换包装），下列规则与现有 Cursor skill、Hydro 题面格式一致，应作为项目约定：

### 2.1 算法核冻结

- 同一输入实例 → 同一答案；I/O **结构**不变。
- 标准术语不偷换（子数组、前缀、树等）。
- **I/O 字符集冻结**：题解代码实际比较的字符（如 `'0'`/`'1'`）题面不得改成别的字母。

### 2.2 表面全面重做

- **业务背景写饱满**（角色 / 目标 / 规则来源约 2～5 句），再形式化；禁止只剩数学定义。
- 换场景、换专有名词、换标题；禁止真实公司/品牌名。
- 变量名整题一致替换；公式可拆并可展开，语义恒等。

### 2.3 数据范围：只换记法

- 原题 `$2\times 10^5$` / `2e5` → 新题 `` `200000` ``；反之亦然。
- 模数 `$10^9+7$` ↔ `` `1000000007` `` 同理。
- **禁止**改到另一复杂度档；禁止把 `$2\times 10^5$` 错写成 `100000`。

### 2.4 样例

- 2～4 条；**禁止**整段或特征行复用原样例。
- 每条有 `**说明**`；答案须按原算法核算对（可本地跑标程）。

### 2.5 题面 Markdown 骨架（与 ProblemIde 兼容）

与 `fix/题目格式需求.txt` 一致，Hydro / ProblemIde 均可直接渲染：

```markdown
# 题名（可选，文首）

# 题目内容
…

# 输入描述
…

# 输出描述
…

## 样例1
**输入**
```
…
```
**输出**
```
…
```
**说明**
…
```

数字两侧加反引号；公式用 `$...$`。

### 2.6 题解模板（教学向，可选）

改写后若同步题解，固定三节 + 三语言（与少儿班多语言练习一致）：

1. `## 解题思路`
2. `## 复杂度分析`
3. `## 代码实现` → Python / Java / C++（注释用中文、对齐新题面用语）

---

## 3. 不应并入 FishOJ 插件层的部分

| 项 | 原因 |
|---|---|
| `log/`、`backup/`、批量进度 JSON | 运行产物，体积大，不应进 addon / 不宜提交 |
| `--source deepseek` 全自动流水线 | FishOJ 二次开发约定以 Cursor Agent 为主；密钥与平台强绑定 |
| 硬编码 `https://codefun2000.com` | FishOJ 目标域是本站 Hydro；API 凭据勿写进仓库 |
| 把改写脚本挂在 ProblemIde `apply()` | 违反「插件高内聚」：IDE ≠ 题库改写工具 |

**建议落位（长期）**

- 规则与提示词：保留精简副本（见下节路径），或迁到仓库外 `utils/` / 独立题库工作区。
- 交付物：本地 `题库/Pxxxx/` 或工作区 `Problems/Pxxxx/` 的 `题面.md` + `题面_改写.md`，再导入 Hydro。
- Cursor：继续用 skill `problem-statement-restyle-flavor`（客观题用 `objective-quiz-restyle`）。

---

## 4. 本仓库内权威提示词路径

当前仍位于（只读规则源，勿当运行时依赖）：

| 文件 | 用途 |
|---|---|
| `addons/ProblemIde/fix/prompts/step3_system.txt` | 新题面硬约束 |
| `addons/ProblemIde/fix/prompts/step3_user.txt` | 对照原题 + 题解代码改写 |
| `addons/ProblemIde/fix/prompts/step4_system.txt` | 新样例硬约束 |
| `addons/ProblemIde/fix/prompts/step35_system.txt` | 题解模板与适配 |
| `addons/ProblemIde/fix/题目格式需求.txt` | 拼接骨架 |
| `addons/ProblemIde/fix/AGENT_REWRITE.md` | Agent 工作流摘要 |

Agent 改写时**打开上述文件**执行，不要凭空缩短规则。  
FishOJ 交付形态优先 **整份 Markdown**（`题面_改写.md`），不必再产出 `03_*.json` / `04_*.json`，除非要继续跑旧上传脚本。

---

## 5. 推荐工作流（贴合本项目）

```
1. 取得原题面 → 题库/P{pid}/题面.md（或本地 Problems/…）
2. 按 §2 + step3/step4 提示词改写 → 题面_改写.md
3. （可选）按 step35 模板写题解.md
4. 本地用标程/暴力核对样例
5. 导入 / 更新本站 Hydro 题目 content（只改 title/content，不动 tag/难度除非老师要求）
6. 学员在 ProblemIde 做题；脚手架 / Tutor 仍走 learning-contract，与改写无关
```

单题调试可参考旧脚本模式，但**目标 base-url 应为本站**，且勿把凭据提交进 Git。

---

## 6. 一句话结论

从 `fix` 提炼进 FishOJ 的，是**「算法核不变的题面表面改写规范 + Hydro 兼容 Markdown 骨架 + 教学向题解模板」**；  
不是 CodeFun2000 批量上传流水线，也不是 ProblemIde 页面功能。
