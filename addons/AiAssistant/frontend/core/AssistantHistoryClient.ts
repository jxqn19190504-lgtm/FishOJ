import {
  ASSISTANT_HISTORY_URL,
  type AssistantClientContext,
  type AssistantConversationDetail,
  type AssistantConversationListItem,
} from '../../shared/assistant-types';

export async function fetchAssistantHistoryList(
  clientContext: Pick<AssistantClientContext, 'abbreviation' | 'pid'>,
): Promise<{ ok: true; items: AssistantConversationListItem[] } | { ok: false; error: string }> {
  const params = new URLSearchParams({
    abbreviation: clientContext.abbreviation,
    pid: clientContext.pid,
  });
  const res = await fetch(`${ASSISTANT_HISTORY_URL}?${params.toString()}`, {
    credentials: 'same-origin',
  });
  const data = (await res.json()) as { items?: AssistantConversationListItem[]; error?: string };
  if (!res.ok || !Array.isArray(data.items)) {
    return { ok: false, error: data.error || '加载历史失败' };
  }
  return { ok: true, items: data.items };
}

export async function fetchAssistantHistoryDetail(
  id: string,
): Promise<{ ok: true; detail: AssistantConversationDetail } | { ok: false; error: string }> {
  const res = await fetch(`${ASSISTANT_HISTORY_URL}/${encodeURIComponent(id)}`, {
    credentials: 'same-origin',
  });
  const data = (await res.json()) as AssistantConversationDetail & { error?: string };
  if (!res.ok || !data?.id) {
    return { ok: false, error: data.error || '加载对话失败' };
  }
  return { ok: true, detail: data };
}

export async function deleteAssistantHistory(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${ASSISTANT_HISTORY_URL}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error || '删除失败' };
  }
  return { ok: true };
}

export function formatHistoryTime(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay) return `今天 ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}
