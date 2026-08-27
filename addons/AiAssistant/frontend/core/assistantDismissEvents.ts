/**
 * AI 助教入口胶囊「关闭状态」跨模块通信契约。
 *
 * AIAssistant 在 dismissed 变化时派发 CHANGE 事件；
 * 宿主页面（如 IDE 右上角设置面板开关）通过派发 SET 事件请求恢复/关闭胶囊。
 * 场景字段用于区分同一页面可能挂载的多个助教实例。
 */

export const ASSISTANT_DISMISSED_CHANGE_EVENT = 'cf-assistant-dismissed-change';
export const ASSISTANT_SET_DISMISSED_EVENT = 'cf-assistant-set-dismissed';

export type AssistantDismissedEventDetail = {
  scene: string;
  dismissed: boolean;
};

export function isAssistantDismissedDetail(
  detail: unknown,
  scene: string,
): detail is AssistantDismissedEventDetail {
  const d = detail as Partial<AssistantDismissedEventDetail> | null;
  return Boolean(d && d.scene === scene && typeof d.dismissed === 'boolean');
}

/** AIAssistant 内部状态变化 → 通知宿主页面同步开关 UI */
export function dispatchAssistantDismissedChange(detail: AssistantDismissedEventDetail): void {
  window.dispatchEvent(new CustomEvent(ASSISTANT_DISMISSED_CHANGE_EVENT, { detail }));
}

/** 宿主页面开关 → 请求 AIAssistant 设置关闭状态 */
export function dispatchAssistantSetDismissed(detail: AssistantDismissedEventDetail): void {
  window.dispatchEvent(new CustomEvent(ASSISTANT_SET_DISMISSED_EVENT, { detail }));
}