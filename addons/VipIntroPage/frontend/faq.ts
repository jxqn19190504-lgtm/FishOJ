import { $ } from '@hydrooj/ui-default';

export function initFAQ() {
    $('.faq-item').each(function () {
        const item = $(this);
        item.find('.faq-question').on('click', () => item.toggleClass('active'));
    });
}
