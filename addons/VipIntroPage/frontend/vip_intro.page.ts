import './vip.css';

// VIP 页面样式已注入，移除 FOUC 防护
if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('is-loading');
    document.documentElement.classList.add('is-loaded');
}

import { addPage, NamedPage } from '@hydrooj/ui-default';
import { initCheckout } from './checkout';
import { initFAQ } from './faq';
import { initPaymentSelection } from './payment';
import { initPlanSelection } from './plan';
import { initTuanCardToggle } from './tuanCard';

addPage(new NamedPage(['vip'], async () => {
    document.querySelectorAll('button').forEach((btn) => {
        btn.setAttribute('style', 'transform:none !important;');
    });
    initPlanSelection();
    initPaymentSelection();
    initTuanCardToggle();
    initCheckout();
    initFAQ();
}));
