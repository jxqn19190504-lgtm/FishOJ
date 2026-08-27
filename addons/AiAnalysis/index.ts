import { Context, PRIV } from 'hydrooj';
import { AiAnalysisAdminHandler } from './handler/analysisAdmin';
import { AiAnalysisCacheHandler } from './handler/cache';
import { ProblemIdeAiQuotaHandler } from './handler/ideQuota';
import { AiAnalysisQuotaHandler } from './handler/quota';
import { AiAnalysisStreamHandler } from './handler/stream';
import { bindAiAnalysisOnProblemIde } from './hooks/problemIde';
import { ensureAiAnalysisCacheIndexes } from './lib/cache';
import { ensureAiAnalysisQuotaIndexes } from './lib/quota';
import './types';

export function apply(ctx: Context) {
    ctx.inject(['db'], async (c) => {
        await ensureAiAnalysisQuotaIndexes(c);
        await ensureAiAnalysisCacheIndexes(c);
    });
    ctx.Route('ai_analysis_stream', '/ai-analysis/stream', AiAnalysisStreamHandler);
    ctx.Route('ai_analysis_cache', '/ai-analysis/cache', AiAnalysisCacheHandler);
    ctx.Route('ai_analysis_quota', '/ai-analysis/quota', AiAnalysisQuotaHandler);
    ctx.Route('problem_ide_ai_quota', '/api/problem/ide-ai-quota', ProblemIdeAiQuotaHandler);
    ctx.Route('manage_ai_analysis', '/manage/ai-analysis', AiAnalysisAdminHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.injectUI('ControlPanel', 'manage_ai_analysis', { icon: 'chart', after: 'manage_ai_assistant' }, PRIV.PRIV_EDIT_SYSTEM);
    ctx.i18n.load('zh', { manage_ai_analysis: 'AI 分析管理' });
    ctx.i18n.load('en', { manage_ai_analysis: 'AI Analysis' });
    bindAiAnalysisOnProblemIde(ctx);
}
