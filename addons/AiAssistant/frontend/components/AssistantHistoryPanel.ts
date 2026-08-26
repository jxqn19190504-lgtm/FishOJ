import type { AssistantConversationListItem } from '../../shared/assistant-types';
import { formatHistoryTime } from '../core/AssistantHistoryClient';

export type AssistantHistoryPanelCallbacks = {
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

export class AssistantHistoryPanel {
  private root: HTMLElement;
  private listEl: HTMLElement;
  private callbacks: AssistantHistoryPanelCallbacks;

  constructor(host: HTMLElement, callbacks: AssistantHistoryPanelCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'cf-assistant-history-view';
    this.root.innerHTML = '<div class="cf-assistant-history-list"></div>';
    host.appendChild(this.root);
    this.listEl = this.root.querySelector('.cf-assistant-history-list') as HTMLElement;
  }

  dispose() {
    this.root.remove();
  }

  renderLoading() {
    this.listEl.innerHTML = '<p class="cf-assistant-history-empty">加载中…</p>';
  }

  renderEmpty(message = '暂无历史对话') {
    this.listEl.innerHTML = `<p class="cf-assistant-history-empty">${escapeHtml(message)}</p>`;
  }

  renderError(message: string) {
    this.listEl.innerHTML = `<p class="cf-assistant-history-empty cf-assistant-history-empty--error">${escapeHtml(message)}</p>`;
  }

  renderList(items: AssistantConversationListItem[]) {
    if (!items.length) {
      this.renderEmpty();
      return;
    }
    this.listEl.innerHTML = items
      .map(
        (item) => `
      <div class="cf-assistant-history-item" data-id="${escapeAttr(item.id)}">
        <button type="button" class="cf-assistant-history-item-main">
          <span class="cf-assistant-history-item-title">${escapeHtml(item.title)}</span>
          <span class="cf-assistant-history-item-meta">${escapeHtml(item.pid)} · ${formatHistoryTime(item.updatedAt)}</span>
        </button>
        <button type="button" class="cf-assistant-history-item-delete" aria-label="删除对话" title="删除">
          <i class="fas fa-trash-can"></i>
        </button>
      </div>`,
      )
      .join('');

    this.listEl.querySelectorAll('.cf-assistant-history-item').forEach((row) => {
      const id = (row as HTMLElement).getAttribute('data-id') || '';
      row.querySelector('.cf-assistant-history-item-main')?.addEventListener('click', () => {
        if (id) this.callbacks.onSelect(id);
      });
      row.querySelector('.cf-assistant-history-item-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (id) this.callbacks.onDelete(id);
      });
    });
  }
}

function escapeHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
