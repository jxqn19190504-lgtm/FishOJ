import {
  ASSISTANT_STREAM_URL,
  type AssistantClientContext,
  type AssistantHistoryMessage,
  type AssistantQuote,
  type AssistantSseDoneEvent,
} from '../../shared/assistant-types';

export type AssistantStreamResult = {
  ok: boolean;
  contentHtml?: string;
  contentMarkdown?: string;
  finishReason?: string;
  quotaConsumed?: boolean;
  aiQuota?: {
    limited: boolean;
    remaining: number;
    quotaCenterPath?: string;
  };
  conversationId?: string;
  error?: string;
  code?: string;
  quotaCenterPath?: string;
};

const CONCURRENT_RETRY = {
  maxAttempts: 4,
  delaysMs: [120, 240, 400],
} as const;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      signal?.removeEventListener('abort', onAbort);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** 覆盖 DOMException / BodyStreamBuffer / 无 reason 的 AbortSignal 拒绝 */
function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { name?: string; message?: string; code?: number };
  if (err.name === 'AbortError') return true;
  // DOMException AbortError 在部分环境 code === 20
  if (err.code === 20 && String(err.name || '').includes('Abort')) return true;
  const msg = String(err.message || '');
  return /aborted|BodyStreamBuffer/i.test(msg);
}

function abortedResult(): AssistantStreamResult {
  return { ok: false, error: '已停止', code: 'ABORTED' };
}

export type AssistantStreamControl = {
  /** 主动取消响应体 reader（应在 abort signal 之前调用） */
  cancel: () => void;
};

export async function runAssistantStream(input: {
  question: string;
  quote?: AssistantQuote | null;
  clientContext: AssistantClientContext;
  history?: AssistantHistoryMessage[];
  conversationId?: string;
  signal?: AbortSignal;
  onHtml?: (html: string) => void;
  /** 拿到 body reader 后回调；结束时传 null 清理 */
  onStreamControl?: (ctrl: AssistantStreamControl | null) => void;
}): Promise<AssistantStreamResult> {
  const isAborted = () => Boolean(input.signal?.aborted);

  try {
    let res: Response | null = null;
    for (let attempt = 0; attempt < CONCURRENT_RETRY.maxAttempts; attempt++) {
      if (isAborted()) {
        return abortedResult();
      }
      res = await fetch(ASSISTANT_STREAM_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          question: input.question,
          quote: input.quote || undefined,
          clientContext: input.clientContext,
          history: input.history || [],
          conversationId: input.conversationId || undefined,
        }),
        signal: input.signal,
      });

      if (isAborted()) {
        return abortedResult();
      }

      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = (await res.json()) as {
          error?: string;
          code?: string;
          quotaCenterPath?: string;
        };
        // 上一请求 abort 后槽位尚未释放时，短暂重试（直接清除策略下的竞态窗口）
        if (
          data.code === 'CONCURRENT_LIMIT'
          && attempt < CONCURRENT_RETRY.maxAttempts - 1
        ) {
          await sleep(CONCURRENT_RETRY.delaysMs[attempt] ?? 400, input.signal);
          continue;
        }
        return {
          ok: false,
          error: data.error || '请求失败',
          code: data.code,
          quotaCenterPath: data.quotaCenterPath,
        };
      }
      break;
    }

    if (!res) {
      return { ok: false, error: '请求失败' };
    }
    if (!res.ok || !res.body) {
      return { ok: false, error: res.statusText || '请求失败' };
    }

    const reader = res.body.getReader();
    const cancelReader = () => {
      void reader.cancel().catch(() => { /* ignore */ });
    };
    /** 供上层 stop()：先 cancel reader 再 abort，避免 BodyStreamBuffer 游离拒绝 */
    input.onStreamControl?.({ cancel: cancelReader });
    /** abort 时再兜底 cancel（上层未先调 cancel 时） */
    input.signal?.addEventListener('abort', cancelReader);
    if (input.signal?.aborted) cancelReader();

    const decoder = new TextDecoder();
    let buf = '';
    let donePayload: AssistantSseDoneEvent | null = null;
    let streamError: string | null = null;
    let streamErrorCode: string | undefined;
    let streamQuotaCenterPath: string | undefined;

    let pendingHtml: string | null = null;
    let streamDebounceT: ReturnType<typeof setTimeout> | null = null;
    let streamFirstFlush = true;

    const clearStreamPaintTimer = () => {
      if (streamDebounceT !== null) {
        clearTimeout(streamDebounceT);
        streamDebounceT = null;
      }
    };

    try {
      const flushStreamHtmlNow = () => {
        clearStreamPaintTimer();
        if (pendingHtml === null) return;
        const html = pendingHtml;
        pendingHtml = null;
        if (!isAborted()) input.onHtml?.(html);
      };

      const queueStreamHtml = (html: string) => {
        if (isAborted()) return;
        pendingHtml = html;
        if (streamFirstFlush) {
          streamFirstFlush = false;
          flushStreamHtmlNow();
          return;
        }
        clearStreamPaintTimer();
        streamDebounceT = setTimeout(flushStreamHtmlNow, 90);
      };

      while (true) {
        if (isAborted()) {
          cancelReader();
          clearStreamPaintTimer();
          return abortedResult();
        }
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (readErr) {
          if (isAbortError(readErr) || isAborted()) {
            clearStreamPaintTimer();
            return abortedResult();
          }
          throw readErr;
        }
        const { done, value } = chunk;
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          try {
            const ev = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
            if (ev.type === 'html' && typeof ev.html === 'string') {
              queueStreamHtml(ev.html);
            } else if (ev.type === 'done') {
              donePayload = ev as AssistantSseDoneEvent;
            } else if (ev.type === 'error') {
              streamError = String(ev.error || '请求失败');
              if (typeof ev.code === 'string' && ev.code) streamErrorCode = ev.code;
              if (typeof ev.quotaCenterPath === 'string' && ev.quotaCenterPath) {
                streamQuotaCenterPath = ev.quotaCenterPath;
              }
            }
          } catch {
            /* ignore malformed chunk */
          }
        }
      }

      if (isAborted()) {
        clearStreamPaintTimer();
        return abortedResult();
      }

      flushStreamHtmlNow();

      if (streamError) {
        return {
          ok: false,
          error: streamError,
          code: streamErrorCode,
          quotaCenterPath: streamQuotaCenterPath,
        };
      }
      if (donePayload) {
        return {
          ok: true,
          contentHtml: donePayload.contentHtml,
          contentMarkdown: donePayload.contentMarkdown,
          finishReason: donePayload.finishReason,
          quotaConsumed: donePayload.quotaConsumed,
          aiQuota: donePayload.aiQuota,
          conversationId: donePayload.conversationId,
        };
      }
      return { ok: false, error: '流式响应异常结束' };
    } finally {
      input.signal?.removeEventListener('abort', cancelReader);
      input.onStreamControl?.(null);
      clearStreamPaintTimer();
    }
  } catch (e: any) {
    input.onStreamControl?.(null);
    if (isAbortError(e) || isAborted()) {
      return abortedResult();
    }
    throw e;
  }
}
