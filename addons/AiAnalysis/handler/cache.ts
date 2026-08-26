import { Handler, ObjectId, PRIV, RecordModel } from 'hydrooj';
import { getAiAnalysisCacheIfValid } from '../lib/cache';

/** GET `/ai-analysis/cache?rid=` — 查询缓存，不扣次 */
export class AiAnalysisCacheHandler extends Handler {
    async get() {
        const rid = String((this.request.query as { rid?: string })?.rid || '').trim();
        if (!rid) {
            this.response.body = { hasCache: false };
            return;
        }
        const uid = Number(this.user._id);
        if (!uid) {
            this.response.body = { hasCache: false };
            return;
        }
        let rdoc: any;
        try {
            rdoc = await RecordModel.get(new ObjectId(rid));
        } catch {
            this.response.body = { hasCache: false };
            return;
        }
        if (!rdoc) {
            this.response.body = { hasCache: false };
            return;
        }
        if (Number(rdoc.uid) !== uid && !this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) {
            this.response.body = { hasCache: false };
            return;
        }
        const cached = await getAiAnalysisCacheIfValid(this.ctx, new ObjectId(rid));
        if (cached?.contentHtml?.trim()) {
            this.response.body = { hasCache: true, contentHtml: cached.contentHtml };
        } else {
            this.response.body = { hasCache: false };
        }
    }
}
