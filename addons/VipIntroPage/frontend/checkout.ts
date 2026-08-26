import { $, Notification } from '@hydrooj/ui-default';

function isLoggedIn() {
    const id = Number((window as any).UserContext?._id);
    return Number.isFinite(id) && id > 1;
}

export function initCheckout() {
    const openBtn = $('#openTuanModal');
    const comingModal = $('#comingSoonModal');
    const tuanModal = $('#tuanModal');
    if (!openBtn.length || !comingModal.length) return;

    function openComingSoon() {
        comingModal.addClass('show').attr('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
    function closeComingSoon() {
        comingModal.removeClass('show').attr('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
    function openTuan() {
        tuanModal.addClass('show');
        $('body').addClass('no-scroll');
        const ackBtn = $('#tuanAckBtn');
        let t = 3;
        ackBtn.prop('disabled', true).text(`我已知晓拼团流程 (${t})`);
        const timer = window.setInterval(() => {
            t -= 1;
            if (t > 0) ackBtn.text(`我已知晓拼团流程 (${t})`);
            else {
                ackBtn.text('我已知晓拼团流程');
                ackBtn.prop('disabled', false);
                window.clearInterval(timer);
            }
        }, 1000);
        tuanModal.data('timer', timer);
    }
    function closeTuan() {
        const timer = tuanModal.data('timer');
        if (timer) window.clearInterval(timer);
        tuanModal.removeClass('show');
        $('body').removeClass('no-scroll');
        $('#tuanAckBtn').prop('disabled', true).text('我已知晓拼团流程 (3)');
    }

    openBtn.on('click', () => {
        if (openBtn.prop('disabled')) return;
        if (!isLoggedIn()) {
            if (typeof (window as any).showSignInDialog === 'function') (window as any).showSignInDialog();
            else Notification.info('请先登录后再开通会员');
            return;
        }
        const isGroup = $('.plan.active').attr('name') === 'groupPlan';
        if (isGroup) openTuan();
        else openComingSoon();
    });

    comingModal.on('click', (e) => {
        const t = $(e.target);
        if (t.data('close') === 'modal' || t.hasClass('modal__close') || t.hasClass('modal__overlay')) closeComingSoon();
    });
    tuanModal.on('click', (e) => {
        const t = $(e.target);
        if (t.data('close') === 'modal' || t.hasClass('modal__close')) closeTuan();
    });
    $('#tuanAckBtn').on('click', function () {
        if ($(this).prop('disabled')) return;
        closeTuan();
        openComingSoon();
    });
    $(document).on('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (comingModal.hasClass('show')) closeComingSoon();
        if (tuanModal.hasClass('show')) closeTuan();
    });
}
