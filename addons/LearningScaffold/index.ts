import { Context, PRIV } from 'hydrooj';
import { ScaffoldConfigHandler, ScaffoldSelectHandler } from './handler/scaffold';
import { ScaffoldAdminHandler } from './handler/scaffoldAdmin';
import { ScaffoldAdminLegacyRedirectHandler, ScaffoldManageHandler } from './handler/scaffoldManage';
import { bindScaffoldOnProblemIde } from './hooks/problemIde';
import { problemColl, scaffoldColl, choiceColl } from './model/learning';
import './types';

export function apply(ctx: Context) {
    ctx.inject(['db'], async (c) => {
        await problemColl(c).createIndex({ domainId: 1, pid: 1 }, { unique: true });
        await scaffoldColl(c).createIndex(
            { domainId: 1, pid: 1, language: 1, level: 1 },
            { unique: true },
        );
        await choiceColl(c).createIndex({ uid: 1, domainId: 1, pid: 1 }, { unique: true });
    });
    ctx.Route('learning_scaffold_config', '/learning-scaffold/config/:pid', ScaffoldConfigHandler);
    ctx.Route('learning_scaffold_select', '/learning-scaffold/select', ScaffoldSelectHandler);
    ctx.Route('manage_coding_assist', '/manage/coding-assist', ScaffoldManageHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('manage_coding_assist_problem', '/manage/coding-assist/:pid', ScaffoldAdminHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('learning_scaffold_admin', '/learning-scaffold/admin/:pid', ScaffoldAdminLegacyRedirectHandler);
    ctx.injectUI('ControlPanel', 'manage_coding_assist', { icon: 'code' }, PRIV.PRIV_EDIT_SYSTEM);
    ctx.i18n.load('zh', {
        manage_coding_assist: '辅助编码管理',
        manage_coding_assist_problem: '辅助编码题目配置',
        learning_scaffold_admin: '辅助编码管理',
    });
    ctx.i18n.load('en', {
        manage_coding_assist: 'Coding Assist',
        manage_coding_assist_problem: 'Coding Assist Problem',
        learning_scaffold_admin: 'Coding Assist',
    });
    bindScaffoldOnProblemIde(ctx);
}
