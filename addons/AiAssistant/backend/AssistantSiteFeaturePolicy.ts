import type { BuiltAssistantContext } from './AssistantContextBuilder';

const STABLE_SITE_FEATURE_GUIDE = `【本站功能 — 可信说明（长期稳定）】
CodeFun Hot100 / CodeNote 页面常见能力包括：
- Hot100 介绍页与单题笔记页；
- learning（学习）与 practice（练习）两种模式，可在页面切换；
- 左侧题目目录与当前文章正文；
- 题解区多编程语言代码切换（如 C++、Java、Python 等）；
- 内嵌 IDE（InnerIDE）：编写、运行、自测与提交代码；
- 右下角 AI 助教入口：提问、连续追问、查看历史会话、新建会话；
- 划词问 AI：选中正文或代码后可引用提问；
- 登录状态、题库购买权限与页面可见性规则会影响题面/笔记/题解的完整展示；
- AI 助教额度由全站 AiQuota 余额（额度点）决定，面板底部会展示剩余额度（如有）；额度中心可查看与充值。

不得虚构：当前价格、促销活动、未在上下文中出现的按钮、未确认的管理员功能、内部 API 或数据库细节。`;

export function buildCurrentPageFeatureContext(ctx: BuiltAssistantContext): string {
  const modeDesc = ctx.mode === 'practice'
    ? '练习模式：更适合自主思考，默认不直接展示完整可提交代码（用户明确要求完整代码时除外）。'
    : '学习模式：可阅读笔记与题解（受权限约束）。';
  const introDesc = ctx.isIntroPage
    ? '当前为介绍/导读页，可回答整体结构、学习路径、章节关系与内容概览。'
    : '当前为单题笔记页，可回答该题题意、思路、代码与调试。';
  return `【当前页面功能上下文】
- 页面标题：${ctx.title}
- 题集：${ctx.abbreviation}
- 题目 ID：${ctx.pid}
- ${modeDesc}
- ${introDesc}`;
}

export function buildCurrentPermissionContext(ctx: BuiltAssistantContext): string {
  if (ctx.isReadLimited || ctx.canReadStatement === false) {
    return '【当前权限】用户无权阅读当前正文/题面。服务端不应向你提供未授权正文；不得编造或复述未授权笔记、题面或题解。';
  }
  if (ctx.canSeeSolution) {
    return '【当前权限】用户可见完整题解内容，回答时可参考题解但不要大段复制。';
  }
  return '【当前权限】用户当前不可见完整题解，不得引用未授权题解内容；可基于已授权题面/笔记解释题意、思路与通用算法知识。';
}

export function buildCurrentQuotaContext(): string {
  return '【AI 额度】具体剩余额度点以本次请求服务端返回的数据为准；若上下文未提供具体数字，说明「以页面底部额度显示为准」，不得猜测或编造「每日次数」。';
}

export function buildSiteFeaturePolicy(ctx: BuiltAssistantContext): string {
  return [
    STABLE_SITE_FEATURE_GUIDE,
    buildCurrentPageFeatureContext(ctx),
    buildCurrentPermissionContext(ctx),
    buildCurrentQuotaContext(),
    `【本站功能回答要求】
- 只依据上述可信说明与页面元数据回答功能问题；
- 信息不足时明确说明「当前页面上下文中没有足够信息确认这一点，请以页面实际展示为准」，并补充目前已能确认的部分；
- 不得因功能问题返回无关拒答固定文案。`,
  ].join('\n\n');
}
