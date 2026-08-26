import './vip.css';
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
