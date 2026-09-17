// FishOjTheme 全局主题：导入深海鎏金样式表。
// 该 CSS 会被 Hydro 前端构建收集进全局 entry.js，对整站所有页面生效。
import './theme.css';

// 主题样式已注入，移除 FOUC 防护
if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('is-loading');
    document.documentElement.classList.add('is-loaded');
}
