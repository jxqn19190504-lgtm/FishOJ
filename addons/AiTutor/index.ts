import { Context, PRIV } from 'hydrooj';
import { AiTutorAdminHandler } from './handler/tutorAdmin';
import { AiTutorHintHandler } from './handler/tutor';
import { bindTutorOnProblemIde } from './hooks/problemIde';
import { eventColl, sessionColl } from './model/tutorSession';
import './types';

export function apply(ctx: Context) {
    ctx.inject(['db'], async (c) => {
        await sessionColl(c).createIndex({ uid: 1, domainId: 1, pid: 1 }, { unique: true });
        await eventColl(c).createIndex({ uid: 1, pid: 1, timestamp: -1 });
    });
    ctx.Route('ai_tutor_hint', '/ai-tutor/hint', AiTutorHintHandler);
    ctx.Route('manage_ai_tutor', '/manage/ai-tutor', AiTutorAdminHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.injectUI('ControlPanel', 'manage_ai_tutor', { icon: 'cloud' }, PRIV.PRIV_EDIT_SYSTEM);
    ctx.i18n.load('zh', { manage_ai_tutor: 'AI Tutor 管理' });
    ctx.i18n.load('en', { manage_ai_tutor: 'AI Tutor' });
    bindTutorOnProblemIde(ctx);
}
