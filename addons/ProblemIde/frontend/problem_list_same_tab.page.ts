import { addPage, NamedPage } from '@hydrooj/ui-default';

function pidFromProblemHref(href: string): string | null {
    try {
        const u = new URL(href, window.location.origin);
        if (u.origin !== window.location.origin) return null;
        const parts = u.pathname.split('/').filter(Boolean);
        const i = parts.lastIndexOf('p');
        if (i < 0) return null;
        const pid = parts[i + 1];
        if (!pid || parts[i + 2]) return null;
        if (['edit', 'files', 'submit', 'stat', 'hack', 'solution'].includes(pid)) return null;
        return decodeURIComponent(pid);
    } catch {
        return null;
    }
}

function keepContestQuery(): string {
    const tid = new URLSearchParams(window.location.search).get('tid');
    return tid ? `?tid=${encodeURIComponent(tid)}` : '';
}

function interceptProblemLinks() {
    document.addEventListener('click', (ev) => {
        const a = (ev.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
        if (!a || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        const pid = pidFromProblemHref(a.getAttribute('href') || '');
        if (!pid) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        a.removeAttribute('target');
        window.location.assign(`/ide/${encodeURIComponent(pid)}${keepContestQuery()}`);
    }, true);
}

addPage(new NamedPage([
    'problem_main',
    'problem_category',
    'homework_detail',
    'contest_detail',
    'training_detail',
    'problem_ide',
], interceptProblemLinks));
