import { $ } from '@hydrooj/ui-default';

export function initPaymentSelection() {
    const payWrap = $('.radio-row');
    if (!payWrap.length) return;
    const payLabels = payWrap.find('.pay');
    const payTextEl = $('.order-line:nth-of-type(2) span:last-child');
    function setSelected(label) {
        payLabels.each(function () {
            const isSelected = this === label[0];
            $(this).toggleClass('selected', isSelected);
            const radio = $(this).find('input[type="radio"]');
            if (radio.length) radio.prop('checked', isSelected);
        });
        if (payTextEl.length) {
            const name = label.find('b').text().trim() || '';
            payTextEl.text(` ${name} `);
        }
    }
    payLabels.each(function () {
        $(this).on('click', function () {
            if ($(this).data('disabled') === 'true' || $(this).hasClass('disabled')) return;
            setSelected($(this));
        });
    });
}
