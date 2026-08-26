export function idePathForItem(pid: string | number, href?: string): string {
    const fromHref = String(href || '').match(/\/(?:ide|p)\/([^/?#]+)/);
    const id = fromHref?.[1] || String(pid || '').trim();
    if (!id) return '/ide/';
    const keep = new URLSearchParams(window.location.search);
    const q = keep.toString();
    return `/ide/${encodeURIComponent(id)}${q ? `?${q}` : ''}`;
}

export function bindSamePageIdeLinks(root: HTMLElement, selector: string) {
    root.addEventListener('click', (ev) => {
        const el = (ev.target as HTMLElement | null)?.closest?.(selector) as HTMLElement | null;
        if (!el || !root.contains(el)) return;
        if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        const path = el.getAttribute('data-ide-path') || (el as HTMLAnchorElement).getAttribute?.('href');
        if (path) window.location.assign(path);
    }, true);
}
