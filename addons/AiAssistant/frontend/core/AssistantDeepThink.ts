import { ASSISTANT_DEEP_THINK_KEY } from '../../shared/assistant-constants';

export function isAssistantDeepThinkEnabled(): boolean {
  try {
    return localStorage.getItem(ASSISTANT_DEEP_THINK_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAssistantDeepThinkEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ASSISTANT_DEEP_THINK_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}
