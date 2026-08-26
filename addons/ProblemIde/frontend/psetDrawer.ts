import { request } from '@hydrooj/ui-default';
import { escapeHtml } from './html';
import { bindSamePageIdeLinks, idePathForItem } from './psetNav';

type IdePsetItem = {
    index?: number; pid: string | number; title: string; difficulty?: number | string | null;
    accepted?: boolean; href: string; current?: boolean; sectionTitle?: string;
};

export function setupIdePsetDrawer() {
    const btn = document.getElementById('problemIdePsetDrawerBtn');
    const overlay = document.getElementById('problemIdePsetOverlay') as HTMLElement | null;
    const listEl = document.getElementById('problemIdePsetList');
    const footerEl = document.getElementById('problemIdePsetFooter');
    const titleEl = document.getElementById('problemIdePsetTitle');
    const subtitleEl = document.getElementById('problemIdePsetSubtitle');
    const progressEl = document.getElementById('problemIdePsetProgress');
    if (!btn || !overlay || !listEl || !footerEl) return;
    const pid = String((window as any).UiContext?.problemId ?? (window as any).UiContext?.problemNumId ?? '').trim();
    const close = () => { overlay.hidden = true; };
    overlay.querySelectorAll('[data-role="close"]').forEach((el) => el.addEventListener('click', close));
    const load = async () => {
        titleEl && (titleEl.textContent = '题库');
        subtitleEl && (subtitleEl.textContent = '');
        progressEl && (progressEl.textContent = '');
        listEl.innerHTML = '';
        footerEl.textContent = '加载中…';
        try {
            const resp = await request.get(`/api/problem/ide-pset-list?pid=${encodeURIComponent(pid)}&offset=0&limit=50`) as any;
            const items: IdePsetItem[] = Array.isArray(resp?.items) ? resp.items : [];
            if (titleEl) titleEl.textContent = resp?.psName || '题库';
            if (!items.length) {
                footerEl.textContent = '当前题目未关联题库。题库上线后，这里会列出同套题目并可跳转。';
                return;
            }
            const total = Number(resp.total) || items.length;
            const acceptedTotal = Number(resp.acceptedTotal) || 0;
            if (progressEl) progressEl.textContent = `完成进度 ${acceptedTotal} / ${total}`;
            listEl.innerHTML = items.map((item) => {
                const cls = [
                    'problem-ide-pset-item',
                    item.current ? 'problem-ide-pset-item--current' : '',
                    item.accepted ? 'problem-ide-pset-item--ac' : '',
                ].filter(Boolean).join(' ');
                const path = idePathForItem(item.pid, item.href);
                return `<button type="button" class="${cls}" data-ide-path="${escapeHtml(path)}"><span class="problem-ide-pset-item__idx">${escapeHtml(String(item.index ?? ''))}</span><span class="problem-ide-pset-item__title">${escapeHtml(item.title || String(item.pid))}</span></button>`;
            }).join('');
            footerEl.textContent = '点击题目在本页切换';
        } catch {
            footerEl.textContent = '当前还没有题库服务。创建题库并接上 /api/problem/ide-pset-list 后，这里会自动列出题目。';
        }
    };
    bindSamePageIdeLinks(listEl, '.problem-ide-pset-item[data-ide-path]');
    btn.addEventListener('click', () => {
        overlay.hidden = false;
        void load();
    });
}
