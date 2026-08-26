import { PassThrough } from 'stream';
import { Handler } from 'hydrooj';
import { parseAssistantStreamRequest } from './AssistantValidator';
import {
  AssistantRateLimitService,
  resolveClientIp,
} from './AssistantRateLimitService';
import { runAssistantStream, sseWrite } from './AssistantService';

export class AssistantStreamHandler extends Handler {
  /** 业务层已做登录/内容门禁；避免 domain.roles.vip 缺失时 VIP 被框架 PERM_VIEW 误杀 */
  noCheckPermView = true;

  async post() {
    const uid = Number(this.user?._id || 0);
    const ip = resolveClientIp(this);

    const rate = AssistantRateLimitService.checkRequestAllowed({ uid, ip });
    if (!rate.ok) {
      this.response.body = { error: rate.message, code: rate.code };
      return;
    }

    let request;
    try {
      request = parseAssistantStreamRequest(this.request.body);
    } catch (e: any) {
      this.response.body = { error: e?.message || '请求参数无效' };
      return;
    }

    if (uid) AssistantRateLimitService.acquireConcurrent(uid);

    const stream = new PassThrough();
    this.response.template = null as any;
    this.response.type = 'text/event-stream; charset=utf-8';
    this.response.body = stream;
    (this.context as any).compress = false;
    this.context.set('Cache-Control', 'no-cache');
    this.context.set('X-Accel-Buffering', 'no');

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const clientAbort = new AbortController();
    const onClientGone = () => {
      if (!clientAbort.signal.aborted) clientAbort.abort();
    };
    const req = (this.request as any)?.req || (this.context as any)?.req;
    try {
      req?.once?.('close', onClientGone);
      req?.once?.('aborted', onClientGone);
      stream.once('close', onClientGone);
    } catch {
      /* ignore */
    }

    (async () => {
      try {
        await runAssistantStream({
          domainId: this.domain._id,
          user: this.user,
          request,
          stream,
          requestId,
          clientAbortSignal: clientAbort.signal,
          onLocalUnrelatedHit: (hitUid) => {
            AssistantRateLimitService.recordLocalUnrelatedHit(hitUid);
          },
        });
      } catch (e: any) {
        sseWrite(stream, {
          type: 'error',
          error: e?.message || '无法发起 AI 助教请求',
          code: e?.code || 'FAILED',
          ...(e?.quotaCenterPath ? { quotaCenterPath: e.quotaCenterPath } : {}),
        });
        stream.end();
      } finally {
        try {
          req?.off?.('close', onClientGone);
          req?.off?.('aborted', onClientGone);
        } catch {
          /* ignore */
        }
        if (uid) AssistantRateLimitService.releaseConcurrent(uid);
      }
    })();
  }
}
