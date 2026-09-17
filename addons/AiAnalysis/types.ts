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

export type AiAnalysisLogDoc = {
    uid: number;
    uname?: string;
    rid: string;
    domainId?: string;
    problemDocId?: number;
    problemPid?: string | number;
    provider?: string;
    model?: string;
    useCustomApiKey: boolean;
    disableCache?: boolean;
    fromCache?: boolean;
    quotaConsumed?: boolean;
    success: boolean;
    error?: string;
    time?: Date;
};

declare module 'hydrooj' {
    interface Collections {
        fish_ai_analysis_daily: AiAnalysisQuotaDoc;
        fish_ai_analysis_cache: AiAnalysisCacheDoc;
        fish_ai_analysis_log: AiAnalysisLogDoc;
    }
}
