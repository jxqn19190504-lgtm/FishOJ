import './aiAnalysis.css';

// AI 分析样式已注入，移除 FOUC 防护
if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('is-loading');
    document.documentElement.classList.add('is-loaded');
}

import { addPage, NamedPage } from '@hydrooj/ui-default';
import { initAiAnalysis } from './aiAnalysis';

addPage(new NamedPage(['problem_ide'], async () => {
    initAiAnalysis();
}));
