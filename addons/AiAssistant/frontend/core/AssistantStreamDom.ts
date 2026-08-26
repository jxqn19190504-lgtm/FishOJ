import type { AssistantStickToBottom } from './AssistantStickToBottom';

/**
 * 流式 HTML 写入：只更新内层 mount。
 * 滚动交给 StickToBottom：贴底跟随；用户上滑后保持视口，避免跳动。
 */
export function patchAssistantStreamHtml(
  mount: HTMLElement,
  html: string,
  stick?: AssistantStickToBottom | null,
): void {
  mount.innerHTML = html;
  stick?.afterContentMutation();
}

export function ensureAssistantStreamMount(body: HTMLElement): HTMLElement {
  let mount = body.querySelector('.cf-assistant-msg-stream-root') as HTMLElement | null;
  if (mount) return mount;
  mount = document.createElement('div');
  mount.className = 'cf-assistant-msg-stream-root';
  body.replaceChildren(mount);
  return mount;
}
