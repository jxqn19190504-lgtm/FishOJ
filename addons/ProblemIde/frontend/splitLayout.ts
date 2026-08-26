import {
    EDITOR_HIDDEN_BY_SPLIT_KEY, GUTTER_WIDTH, HIDE_RIGHT_VISIBLE_WIDTH,
    MAX_LEFT_RATIO, MIN_LEFT_RATIO, MIN_RIGHT_RATIO, SPLIT_KEY,
} from './constants';

function getMinLeftWidth(totalW: number) { return Math.max(0, Math.round(totalW * MIN_LEFT_RATIO)); }
function getMinRightWidth(totalW: number) { return Math.max(0, Math.round(totalW * MIN_RIGHT_RATIO)); }
function getHideAtLeftWidth(totalW: number) { return totalW - GUTTER_WIDTH - HIDE_RIGHT_VISIBLE_WIDTH; }

export function applyIdeSplit(
    left: HTMLElement, gutter: HTMLElement, right: HTMLElement | null,
    root: HTMLElement, targetWidth: number, layoutCb: () => void,
) {
    const totalW = root.getBoundingClientRect().width;
    const minLeftW = getMinLeftWidth(totalW);
    const minRightW = getMinRightWidth(totalW);
    const hideAtLeftW = getHideAtLeftWidth(totalW);
    if (targetWidth >= hideAtLeftW) {
        localStorage.setItem(EDITOR_HIDDEN_BY_SPLIT_KEY, '1');
        left.style.flex = '1 1 auto';
        if (right) { right.style.flex = '0 0 0'; right.style.width = '0'; }
        root.classList.add('problem-ide-root--editor-hidden');
        layoutCb();
        return;
    }
    localStorage.removeItem(EDITOR_HIDDEN_BY_SPLIT_KEY);
    root.classList.remove('problem-ide-root--editor-hidden');
    if (right) { right.style.flex = ''; right.style.width = ''; }
    const maxW = Math.min(totalW * MAX_LEFT_RATIO, Math.max(minLeftW, hideAtLeftW));
    const maxLeftForRight = Math.max(minLeftW, totalW - GUTTER_WIDTH - minRightW);
    const width = Math.min(maxW, maxLeftForRight, Math.max(minLeftW, targetWidth));
    left.style.flex = `0 0 ${(width / totalW) * 100}%`;
    localStorage.setItem(SPLIT_KEY, String((width / totalW) * 100));
    layoutCb();
}

export function restoreIdeSplit(
    left: HTMLElement, gutter: HTMLElement, right: HTMLElement | null,
    root: HTMLElement, layoutCb: () => void,
) {
    const totalW = root.getBoundingClientRect().width;
    if (localStorage.getItem(EDITOR_HIDDEN_BY_SPLIT_KEY) === '1') {
        applyIdeSplit(left, gutter, right, root, getHideAtLeftWidth(totalW), layoutCb);
        return;
    }
    let targetW = totalW * 0.5;
    const saved = localStorage.getItem(SPLIT_KEY);
    if (saved) {
        const p = parseFloat(saved);
        if (p >= 20 && p <= 70) targetW = (totalW * p) / 100;
    }
    applyIdeSplit(left, gutter, right, root, targetW, layoutCb);
}

export function initGutter(
    gutter: HTMLElement, left: HTMLElement, right: HTMLElement | null,
    root: HTMLElement, layoutCb: () => void,
) {
    let startX = 0;
    let startTargetW = 0;
    const onMove = (e: MouseEvent) => {
        applyIdeSplit(left, gutter, right, root, startTargetW + (e.clientX - startX), layoutCb);
    };
    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        gutter.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    };
    gutter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startTargetW = left.getBoundingClientRect().width;
        gutter.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}
