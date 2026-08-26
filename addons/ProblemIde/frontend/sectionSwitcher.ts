import { request } from '@hydrooj/ui-default';
import { escapeHtml } from './html';
import { bindSamePageIdeLinks, idePathForItem } from './psetNav';

export function setupIdeSectionSwitcher() {
    const root = document.getElementById('problemIdeSectionSwitcher') as HTMLElement | null;
    const btn = document.getElementById('problemIdeSectionSwitcherBtn') as HTMLButtonElement | null;
    const menu = document.getElementById('problemIdeSectionSwitcherMenu') as HTMLElement | null;
    const titleEl = document.getElementById('problemIdeSectionSwitcherTitle');
    const listEl = document.getElementById('problemIdeSectionSwitcherList');
    if (!root || !btn || !menu || !titleEl || !listEl) return;
    const pid = String((window as any).UiContext?.problemId ?? (window as any).UiContext?.problemNumId ?? '').trim();
    let open = false;
    const setOpen = (v: boolean) => {
        open = v;
        menu.hidden = !v;
        btn.setAttribute('aria-expanded', v ? 'true' : 'false');
        if (v && menu.parentElement !== document.body) document.body.appendChild(menu);
        if (v) {
            const rect = btn.getBoundingClientRect();
            const width = Math.min(360, window.innerWidth * 0.72);
            menu.style.position = 'fixed';
            menu.style.zIndex = '100010';
            menu.style.width = `${width}px`;
            menu.style.left = `${Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)}px`;
            menu.style.top = `${rect.bottom + 6}px`;
        }
    };
    const renderEmpty = (msg: string) => {
        titleEl.textContent = '当前节点';
        listEl.innerHTML = `<div class="problem-ide-section-switcher__empty">${escapeHtml(msg)}</div>`;
    };
    const load = async () => {
        listEl.innerHTML = '<div class="problem-ide-section-switcher__loading">加载中…</div>';
        try {
            const resp = await request.get(`/api/problem/ide-pset-section?pid=${encodeURIComponent(pid)}`) as any;
            const items = Array.isArray(resp?.items) ? resp.items : [];
            titleEl.textContent = resp?.sectionTitle || '当前节点';
            if (!items.length) {
                renderEmpty('尚未关联章节。题库上线后可在此切换同节点题目。');
                return;
            }
            listEl.innerHTML = items.map((item: any) => {
                const path = idePathForItem(item.pid, item.href);
                const cur = item.current ? ' problem-ide-section-switcher__item--current' : '';
                return `<button type="button" class="problem-ide-section-switcher__item${cur}" data-ide-path="${escapeHtml(path)}" role="menuitem">${escapeHtml(item.title || String(item.pid))}</button>`;
            }).join('');
        } catch {
            renderEmpty('章节接口尚未接入。题库上线后，这里会列出同节点题目。');
        }
    };
    bindSamePageIdeLinks(listEl, '.problem-ide-section-switcher__item[data-ide-path]');
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(!open);
        if (open) void load();
    });
    document.addEventListener('mousedown', (e) => {
        if (!open) return;
        const t = e.target as Node;
        if (root.contains(t) || menu.contains(t)) return;
        setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && open) setOpen(false);
    });
}
