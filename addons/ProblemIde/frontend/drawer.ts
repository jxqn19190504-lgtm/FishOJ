import { DRAWER_KEY } from './constants';

export function setupIdeDrawer(opts: {
    drawer: HTMLElement | null;
    drawerToggle: HTMLElement | null;
    drawerResize: HTMLElement | null;
    layoutEditor: () => void;
}) {
    const { drawer, drawerToggle, drawerResize, layoutEditor } = opts;
    const savedH = localStorage.getItem(DRAWER_KEY);
    if (drawer && savedH) {
        const h = parseInt(savedH, 10);
        if (h >= 80 && h <= 600) drawer.style.height = `${h}px`;
    }
    drawerToggle?.addEventListener('click', () => {
        drawer?.classList.toggle('problem-ide-drawer--collapsed');
        layoutEditor();
    });
    if (drawer && drawerResize) {
        let rStartY = 0;
        let rStartH = 0;
        const onResizeMove = (e: MouseEvent) => {
            const dy = rStartY - e.clientY;
            const maxH = window.innerHeight * 0.6;
            const newH = Math.max(80, Math.min(maxH, rStartH + dy));
            drawer.style.height = `${newH}px`;
            localStorage.setItem(DRAWER_KEY, String(newH));
            layoutEditor();
        };
        const onResizeUp = () => {
            document.removeEventListener('mousemove', onResizeMove);
            document.removeEventListener('mouseup', onResizeUp);
            drawerResize.classList.remove('dragging');
            drawer.classList.remove('problem-ide-drawer--resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        drawerResize.addEventListener('mousedown', (e: MouseEvent) => {
            if (drawer.classList.contains('problem-ide-drawer--collapsed')) return;
            e.preventDefault();
            rStartY = e.clientY;
            rStartH = drawer.getBoundingClientRect().height;
            drawerResize.classList.add('dragging');
            drawer.classList.add('problem-ide-drawer--resizing');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeUp);
        });
    }
}

export function switchIdeDrawerTab(name: string) {
    document.querySelectorAll('.problem-ide-tab').forEach((t) => {
        t.classList.toggle('problem-ide-tab--active', (t as HTMLElement).dataset.tab === name);
    });
    document.querySelectorAll('.problem-ide-panel').forEach((p) => {
        (p as HTMLElement).hidden = (p as HTMLElement).dataset.panel !== name;
    });
}
