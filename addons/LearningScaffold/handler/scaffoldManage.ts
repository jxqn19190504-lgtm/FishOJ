import {
    Handler, param, PRIV, ProblemModel, Types,
} from 'hydrooj';
import { listLearningProblems } from '../model/learning';

export class ScaffoldManageHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    async get(domainId: string) {
        const rows = await listLearningProblems(this.ctx, domainId);
        const items: Array<{
            pid: string;
            title: string;
            enabled: boolean;
            tutorEnabled: boolean;
        }> = [];
        for (const row of rows) {
            const pdoc = await ProblemModel.get(domainId, row.pid);
            items.push({
                pid: row.pid,
                title: pdoc?.title || row.pid,
                enabled: row.enabled !== false,
                tutorEnabled: row.tutorEnabled !== false,
            });
        }
        this.response.template = 'manage_coding_assist.html';
        this.response.body = {
            page_name: 'manage_coding_assist',
            items,
        };
    }

    @param('pid', Types.String)
    async postOpen(_domainId: string, pid: string) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        this.response.redirect = this.url('manage_coding_assist_problem', { pid: String(pid).trim() });
    }
}

export class ScaffoldAdminLegacyRedirectHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    @param('pid', Types.String)
    async get(_domainId: string, pid: string) {
        this.response.redirect = this.url('manage_coding_assist_problem', { pid });
    }
}
