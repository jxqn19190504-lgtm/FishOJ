import './scaffold.css';
import { initLearningScaffold } from './scaffold';

function tryInit() {
    const ctx = (window as any).UiContext;
    if (!ctx) return false;
    try {
        initLearningScaffold();
        return true;
    } catch (e) {
        console.error('[FishOJ] initLearningScaffold error', e);
        return false;
    }
}

function waitAndInit() {
    if (tryInit()) return;
    let count = 0;
    const timer = setInterval(() => {
        if (tryInit() || ++count > 60) clearInterval(timer);
    }, 250);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    waitAndInit();
} else {
    document.addEventListener('DOMContentLoaded', waitAndInit);
}
