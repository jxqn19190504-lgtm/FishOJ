/**
 * FishOJ stub：无 AiQuota 钱包时的无操作额度层。
 * 内置 Key 不限额；仅依赖 DEEPSEEK_API_KEY / BUILTIN_API_KEY。
 */
export const ASSISTANT_CODENOTE_AI = 'codenote-ai-assistant';
export const QUOTA_CENTER_PATH = '/ai-quota';
export const QUOTA_EXCEEDED_MESSAGE = 'AI 助教暂时不可用：请配置 DEEPSEEK_API_KEY，或稍后重试。';

export function estimateTokensFromText(text: string): number {
    const s = String(text || '');
    if (!s) return 0;
    return Math.max(1, Math.ceil(s.length / 4));
}

type ReserveOk = {
    ok: true;
    ticketId: string | null;
    unlimited: boolean;
    remainingDisplay?: number;
    quotaCenterPath?: string;
};
type ReserveFail = {
    ok: false;
    message: string;
    quotaCenterPath?: string;
};

export const AiQuotaService = {
    async ensureIndexes() { /* no-op */ },
    async checkAndReserve(_uid: number, _opts?: unknown): Promise<ReserveOk | ReserveFail> {
        return { ok: true, ticketId: null, unlimited: true, remainingDisplay: 0 };
    },
    async settle(_ticketId: string | null, _usage?: unknown) {
        return { remainingDisplay: 0 };
    },
    async markFailedKept(_ticketId: string | null) { /* no-op */ },
    async releaseReserved(_ticketId: string | null) { /* no-op */ },
};

export const AiLlmApiConfigService = {
    async mergeIntoChatRequest(_serviceId: string, req: Record<string, unknown>) {
        return { ...req };
    },
    async resolve(_serviceId: string) {
        return null;
    },
};
