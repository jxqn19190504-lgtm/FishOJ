// FishOjTheme 全局主题：导入深海鎏金样式表。
// 该 CSS 会被 Hydro 前端构建收集进全局 entry.js，对整站所有页面生效。
// 首屏关键色已在 layout/html5.html 内联，这里补齐其余规则，不再用隐藏 body 防 FOUC。
import './theme.css';
import './tags_sidebar.css';
import './pages_gilded.css';
import { initFishDock } from './dock';
// 题库标签三维分组（来源/赛事/知识点）自注册到 problem_main / problem_category
import './tags_sidebar';

// 主题样式已注入，移除 FOUC 防护
if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('is-loading');
    document.documentElement.classList.add('is-loaded');
}

// 全局 AI 悬浮入口（小方块 → 中等浮窗），全站可见
if (typeof document !== 'undefined') {
    const mountFishDock = () => {
        try { initFishDock(); } catch { /* dock 异常不影响整站渲染 */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountFishDock);
    else mountFishDock();
}
