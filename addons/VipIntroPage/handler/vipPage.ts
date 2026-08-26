import { Handler, PRIV, SystemModel } from 'hydrooj';
import { defaultVipNotice, VIP_NOTICE_KEY } from '../lib/notice';
import { isVipUser } from '../lib/vipRole';
import type { VipStatus } from '../types';

export class VIPPageHandler extends Handler {
    noCheckPermView = true;

    async get() {
        const loggedIn = this.user.hasPriv(PRIV.PRIV_USER_PROFILE);
        let vipStatus: VipStatus = 'guest';
        if (loggedIn) vipStatus = isVipUser(this.user) ? 'vip' : 'non-vip';

        let vipNotice = defaultVipNotice;
        try {
            vipNotice = String(SystemModel.get(VIP_NOTICE_KEY) || defaultVipNotice);
        } catch {
            vipNotice = defaultVipNotice;
        }

        this.response.template = 'vip.html';
        this.response.body = {
            page_name: 'vip',
            vipStatus,
            vipCheckoutReady: false,
            vipNotice,
        };
    }
}
