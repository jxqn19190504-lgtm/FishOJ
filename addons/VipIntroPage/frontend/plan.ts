import { $ } from '@hydrooj/ui-default';

export function initPlanSelection() {
    const plans = $('.plan');
    plans.each(function () {
        $(this).on('click', function () {
            plans.removeClass('active');
            $(this).addClass('active');
            const radio = $(this).find('input[type="radio"]');
            if (radio.length) radio.prop('checked', true);
            const isGroupPlan = $(this).attr('name') === 'groupPlan';
            const vipTypeSpan = $('span[name="vip_type"]');
            const vipPriceSpan = $('span[name="vip_price"]');
            if (vipTypeSpan.length) vipTypeSpan.text(isGroupPlan ? '拼团 永久会员' : '永久会员');
            if (vipPriceSpan.length) vipPriceSpan.text(isGroupPlan ? '¥199' : '¥256');
        });
    });
}
