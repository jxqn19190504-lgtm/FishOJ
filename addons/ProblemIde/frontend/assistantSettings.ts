/**
 * IDE 右上角设置面板 ↔ AI 助教显示开关。
 * 通过 window CustomEvent 与 AiAssistant 通信，禁止 import AiAssistant 模块。
 */

declare const UiContext: {
    aiAssistant?: {
        enabled?: boolean;
        scene?: string;
    };
};

const ASSISTANT_DISMISSED_CHANGE = 'cf-assistant-dismissed-change';
const ASSISTANT_SET_DISMISSED = 'cf-assistant-set-dismissed';

export function initAssistantSettingsToggle(): void {
    if (UiContext.aiAssistant?.enabled !== true) return;

    const toggle = document.getElementById('problemIdeAssistantToggle') as HTMLInputElement | null;
    if (!toggle) return;

    const scene = UiContext.aiAssistant.scene || 'acm-problem';

    const syncFromAssistant = (dismissed: boolean) => {
        toggle.checked = !dismissed;
    };

    window.addEventListener(ASSISTANT_DISMISSED_CHANGE, ((ev: Event) => {
        const d = (ev as CustomEvent<{ scene?: string; dismissed?: boolean }>).detail;
        if (d?.scene !== scene || typeof d.dismissed !== 'boolean') return;
        syncFromAssistant(d.dismissed);
    }) as EventListener);

    toggle.addEventListener('change', () => {
        window.dispatchEvent(new CustomEvent(ASSISTANT_SET_DISMISSED, {
            detail: { scene, dismissed: !toggle.checked },
        }));
    });
}
