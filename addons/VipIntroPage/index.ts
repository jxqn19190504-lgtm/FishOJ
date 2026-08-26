import { Context, SettingModel } from 'hydrooj';
import { VIPPageHandler } from './handler/vipPage';
import { bindIdeShortCooldown } from './hooks/ideCooldown';
import { bindVipRoleOnDomainCreate, ensureVipRole } from './lib/ensureVipRole';
import { defaultVipNotice, VIP_NOTICE_KEY } from './lib/notice';
import './types';

export function apply(ctx: Context) {
    ctx.setting.SystemSetting(
        SettingModel.Setting('setting_info', VIP_NOTICE_KEY, defaultVipNotice, 'markdown', 'VIP 页面公告'),
    );
    ctx.Route('vip', '/vip', VIPPageHandler);
    ctx.injectUI('Nav', 'vip', { before: 'training_main' });
    ctx.i18n.load('zh', { vip: '会员' });
    ctx.i18n.load('en', { vip: 'VIP' });
    bindIdeShortCooldown(ctx);
    bindVipRoleOnDomainCreate(ctx);
    ctx.effect(() => {
        void ensureVipRole();
        return () => { };
    });
}
