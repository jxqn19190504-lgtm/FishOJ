import {
    Handler, param, PRIV, Types, UserModel,
} from 'hydrooj';
import { listAiAnalysisLogs } from '../lib/analysisLog';

type SuccessFilter = '' | '1' | '0';

function parseSuccessFilter(raw?: string): boolean | null {
    const s = String(raw || '').trim();
    if (s === '1') return true;
    if (s === '0') return false;
    return null;
}

async function resolveUserFilter(userRaw: string): Promise<{
    uid?: number;
    unameFallback?: string;
    resolvedLabel: string;
}> {
    const q = String(userRaw || '').trim();
    if (!q) return { resolvedLabel: '' };
    const asNum = Number(q);
    if (Number.isInteger(asNum) && asNum > 0 && String(asNum) === q) {
        const udoc = await UserModel.getById('system', asNum);
        return {
            uid: asNum,
            resolvedLabel: udoc?.uname ? `${udoc.uname} (uid=${asNum})` : `uid=${asNum}`,
        };
    }
    const udoc = await UserModel.coll.findOne({ uname: q });
    if (udoc?._id) {
        const uid = Number(udoc._id);
        return {
            uid,
            resolvedLabel: `${udoc.uname || q} (uid=${uid})`,
        };
    }
    return {
        unameFallback: q,
        resolvedLabel: `uname=${q}（用户表未找到，按日志字段匹配）`,
    };
}

function formatTime(d?: Date): string {
    if (!d) return '-';
    try {
        return new Date(d).toLocaleString('zh-CN');
    } catch {
        return '-';
    }
}

/** GET `/manage/ai-analysis/logs` — 对齐 CodeFun record_ai_analysis_log_manage */
export class AiAnalysisLogManageHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    @param('page', Types.PositiveInt, true)
    @param('user', Types.String, true)
    @param('rid', Types.String, true)
    @param('success', Types.String, true)
    async get(
        _domainId: string,
        page = 1,
        user = '',
        rid = '',
        success: SuccessFilter = '',
    ) {
        const userQ = String(user || '').trim();
        const ridQ = String(rid || '').trim();
        const successQ = String(success || '').trim() as SuccessFilter;
        const successFilter = parseSuccessFilter(successQ);
        const resolved = await resolveUserFilter(userQ);

        const list = await listAiAnalysisLogs(this.ctx, {
            uid: resolved.uid,
            uname: resolved.unameFallback,
            rid: ridQ || undefined,
            success: successFilter === null ? undefined : successFilter,
            page,
            pageSize: 50,
        });

        const rows = list.docs.map((d) => ({
            timeStr: formatTime(d.time),
            uid: d.uid,
            uname: d.uname || '-',
            rid: d.rid || '-',
            problemPid: d.problemPid ?? d.problemDocId ?? '-',
            provider: d.provider || '-',
            model: d.model || '-',
            useCustomApiKey: Boolean(d.useCustomApiKey),
            fromCache: Boolean(d.fromCache),
            quotaConsumed: Boolean(d.quotaConsumed),
            success: Boolean(d.success),
            error: d.error || '',
        }));

        const queryBase: string[] = [];
        if (userQ) queryBase.push(`user=${encodeURIComponent(userQ)}`);
        if (ridQ) queryBase.push(`rid=${encodeURIComponent(ridQ)}`);
        if (successQ === '1' || successQ === '0') queryBase.push(`success=${successQ}`);
        const querySuffix = queryBase.length ? `&${queryBase.join('&')}` : '';

        const pageNumbers: number[] = [];
        for (let i = 1; i <= list.pages; i++) pageNumbers.push(i);

        this.response.template = 'manage_ai_analysis_logs.html';
        this.response.body = {
            page_name: 'manage_ai_analysis_logs',
            rows,
            total: list.total,
            page: list.page,
            pages: list.pages,
            pageNumbers,
            userQ,
            ridQ,
            successQ,
            resolvedLabel: resolved.resolvedLabel,
            querySuffix,
        };
    }
}
