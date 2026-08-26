import { $ } from '@hydrooj/ui-default';

export function initTuanCardToggle() {
    const tuanCard = $('#tuanCard');
    const tuanSteps = $('#tuanSteps');
    const plans = $('.plan');
    if (!tuanCard.length || !plans.length) return;

    function showTuan() {
        if (!tuanCard.prop('hidden')) return;
        tuanCard.prop('hidden', false);
        tuanCard.css({ opacity: 0, transform: 'translateY(10px)', transition: 'opacity 0.4s ease, transform 0.4s ease' });
        requestAnimationFrame(() => {
            tuanCard.css({ opacity: 1, transform: 'translateY(0)' });
        });
        if (tuanSteps.length) {
            tuanSteps.removeClass('tuan-animate');
            void tuanSteps[0].offsetWidth;
            tuanSteps.addClass('tuan-animate');
        }
    }

    function hideTuan() {
        if (tuanCard.prop('hidden')) return;
        tuanCard.css({
            transition: 'opacity 0.4s ease, transform 0.4s ease',
            opacity: '1',
            transform: 'translateY(0)',
        });
        requestAnimationFrame(() => {
            tuanCard.css({ opacity: '0', transform: 'translateY(8px)' });
        });
        setTimeout(() => {
            tuanCard.prop('hidden', true);
            tuanCard.css({ transition: '', transform: '', opacity: '' });
        }, 400);
    }

    plans.each(function () {
        $(this).on('click', function () {
            const tagText = $(this).find('.tag').text().replace(/\s+/g, '') || '';
            const isTuan = tagText.includes('拼团');
            if (isTuan) showTuan();
            else hideTuan();
        });
    });
}
