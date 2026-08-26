const STATEMENT_TOC_DRAWER_MQ = '(max-width: 1299px)';

function isStatementTocDrawerMode(): boolean {
    try { return window.matchMedia(STATEMENT_TOC_DRAWER_MQ).matches; } catch { return false; }
}

function setStatementTocDrawerOpen(open: boolean) {
    const rootEl = document.getElementById('problemIdeRoot');
    const btn = document.getElementById('problemIdeStatementTocDrawerBtn') as HTMLButtonElement | null;
    const backdrop = document.getElementById('problemIdeStatementTocBackdrop');
    if (!rootEl) return;
    rootEl.classList.toggle('problem-ide-root--statement-toc-drawer-open', open);
    btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    backdrop?.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function closeStatementTocDrawer() { setStatementTocDrawerOpen(false); }

export function initStatementToc() {
    const tocEl = document.getElementById('problemIdeStatementToc') as HTMLElement | null;
    const shellEl = document.getElementById('problemIdeStatementTocShell') as HTMLElement | null;
    const rootEl = document.getElementById('problemIdeRoot');
    const scrollEl = document.querySelector('.problem-ide-left__scroll') as HTMLElement | null;
    if (!tocEl || !rootEl || !scrollEl) return;
    const titleEl = tocEl.querySelector('.problem-ide-statement-toc__title') as HTMLElement | null;
    const listEl = tocEl.querySelector('.problem-ide-statement-toc__list') as HTMLElement | null;
    if (!titleEl || !listEl) return;

    const btn = document.getElementById('problemIdeStatementTocDrawerBtn');
    const backdrop = document.getElementById('problemIdeStatementTocBackdrop');
    btn?.addEventListener('click', () => {
        setStatementTocDrawerOpen(!rootEl.classList.contains('problem-ide-root--statement-toc-drawer-open'));
    });
    backdrop?.addEventListener('click', () => closeStatementTocDrawer());
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeStatementTocDrawer();
    });

    const excluded = new Set(['videoSol', 'myNote', 'aiAnalysis']);
    let currentLinks: HTMLAnchorElement[] = [];
    let currentHeadings: HTMLElement[] = [];

    const getActiveType = () => {
        const active = document.querySelector('#problemIdeProblemTabs .section__tab-header-item.tab--active') as HTMLElement | null;
        return active?.getAttribute('data-type') || null;
    };
    const updateActiveLink = () => {
        if (tocEl.hidden || !currentLinks.length) return;
        const containerScrollTop = scrollEl.scrollTop;
        const containerRect = scrollEl.getBoundingClientRect();
        let activeId = '';
        for (const h of currentHeadings) {
            const r = h.getBoundingClientRect();
            const offset = r.top - containerRect.top + containerScrollTop;
            if (containerScrollTop >= offset - 80) activeId = h.id;
        }
        if (!activeId && currentHeadings[0]) activeId = currentHeadings[0].id;
        for (const a of currentLinks) {
            a.classList.toggle('problem-ide-statement-toc__link--active', a.getAttribute('href') === `#${activeId}`);
        }
    };
    const refresh = () => {
        const reset = () => {
            tocEl.hidden = true;
            shellEl?.classList.add('problem-ide-statement-toc-shell--empty');
            closeStatementTocDrawer();
            currentLinks = [];
            currentHeadings = [];
        };
        if (!rootEl.classList.contains('problem-ide-root--statement-expanded')) { reset(); return; }
        const type = getActiveType();
        if (!type || excluded.has(type)) { reset(); return; }
        const panel = document.getElementById(`content-${type}`);
        if (!panel) { reset(); return; }
        const headings = Array.from(panel.querySelectorAll('h1, h2, h3')) as HTMLElement[];
        if (!headings.length) { reset(); return; }
        titleEl.textContent = (window as any).UiContext?.pdoc?.title || '目录';
        listEl.innerHTML = '';
        currentLinks = [];
        currentHeadings = [];
        headings.forEach((h, idx) => {
            if (h.closest('.sample')) return;
            if (!h.id) h.id = `problem-ide-toc-${type}-${idx}`;
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = `#${h.id}`;
            a.textContent = (h.textContent || '').trim();
            a.className = `problem-ide-statement-toc__link problem-ide-statement-toc__link--${h.tagName.toLowerCase()}`;
            a.addEventListener('click', (ev) => {
                ev.preventDefault();
                const target = document.getElementById(h.id);
                if (!target) return;
                const cRect = scrollEl.getBoundingClientRect();
                const tRect = target.getBoundingClientRect();
                scrollEl.scrollTo({ top: Math.max(0, tRect.top - cRect.top + scrollEl.scrollTop - 12), behavior: 'smooth' });
                if (isStatementTocDrawerMode()) closeStatementTocDrawer();
            });
            li.appendChild(a);
            listEl.appendChild(li);
            currentLinks.push(a);
            currentHeadings.push(h);
        });
        shellEl?.classList.remove('problem-ide-statement-toc-shell--empty');
        tocEl.hidden = false;
        requestAnimationFrame(() => updateActiveLink());
    };
    scrollEl.addEventListener('scroll', () => updateActiveLink(), { passive: true });
    window.addEventListener('problem-ide:tab-changed', refresh);
    window.addEventListener('problem-ide:layout-changed', refresh);
    refresh();
}
