export function initAlgTagToggle() {
    document.addEventListener('click', (ev) => {
        const t = ev.target as HTMLElement | null;
        const btn = t?.closest?.('[name="show_tags"]');
        if (!btn) return;
        ev.preventDefault();
        btn.closest('.problem-ide-alg-tags-block')?.classList.toggle('problem-ide-alg-expanded');
    });
}
