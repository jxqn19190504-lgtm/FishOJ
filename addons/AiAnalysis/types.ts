export type AiAnalysisQuotaRef = {
    limited: boolean;
    remaining: number;
    dailyLimit: number | null;
    source?: 'daily_count' | string;
    unlimited?: boolean;
};

export type AiAnalysisQuotaDoc = {
    uid: number;
    date: string;
    count: number;
};

export type AiAnalysisCacheDoc = {
    recordId: any;
    contentHtml: string;
    expiresAt: Date;
    updatedAt: Date;
};

declare module 'hydrooj' {
    interface Collections {
        fish_ai_analysis_daily: AiAnalysisQuotaDoc;
        fish_ai_analysis_cache: AiAnalysisCacheDoc;
    }
}
