import { ASSISTANT_RATE_LIMIT } from './config/assistant-rate-limit.config';

type WindowBucket = { windowStart: number; count: number };

const uidRequestBuckets = new Map<string, WindowBucket>();
const ipRequestBuckets = new Map<string, WindowBucket>();
const uidConcurrent = new Map<number, number>();
const uidUnrelatedHits = new Map<number, { hits: number[]; cooldownUntil: number }>();

function pruneOldHits(hits: number[], windowMs: number, now: number): number[] {
  return hits.filter((t) => now - t <= windowMs);
}

function consumeWindowBucket(
  store: Map<string, WindowBucket>,
  key: string,
  maxPerWindow: number,
  windowMs: number,
): { ok: boolean; retryAfterMs?: number } {
  const now = Date.now();
  let b = store.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    b = { windowStart: now, count: 0 };
    store.set(key, b);
  }
  b.count += 1;
  if (b.count > maxPerWindow) {
    const retryAfterMs = windowMs - (now - b.windowStart);
    return { ok: false, retryAfterMs: Math.max(1000, retryAfterMs) };
  }
  if (store.size > 8000) {
    for (const [k, v] of store) {
      if (now - v.windowStart >= windowMs * 2) store.delete(k);
    }
  }
  return { ok: true };
}

export class AssistantRateLimitService {
  static checkRequestAllowed(input: { uid: number; ip: string }): { ok: true } | { ok: false; message: string; code: string } {
    const now = Date.now();
    const uid = Number(input.uid);
    const ip = String(input.ip || 'unknown').trim() || 'unknown';

    const unrelatedState = uidUnrelatedHits.get(uid);
    if (unrelatedState && unrelatedState.cooldownUntil > now) {
      const sec = Math.ceil((unrelatedState.cooldownUntil - now) / 1000);
      return { ok: false, message: `无关问题请求过于频繁，请 ${sec} 秒后再试`, code: 'UNRELATED_COOLDOWN' };
    }

    const uidBucket = consumeWindowBucket(
      uidRequestBuckets,
      String(uid),
      ASSISTANT_RATE_LIMIT.uidPerMinute,
      ASSISTANT_RATE_LIMIT.requestWindowMs,
    );
    if (!uidBucket.ok) {
      return { ok: false, message: '请求过于频繁，请稍后再试', code: 'RATE_LIMIT_UID' };
    }

    const ipBucket = consumeWindowBucket(
      ipRequestBuckets,
      ip,
      ASSISTANT_RATE_LIMIT.ipPerMinute,
      ASSISTANT_RATE_LIMIT.requestWindowMs,
    );
    if (!ipBucket.ok) {
      return { ok: false, message: '请求过于频繁，请稍后再试', code: 'RATE_LIMIT_IP' };
    }

    const concurrent = uidConcurrent.get(uid) || 0;
    if (concurrent >= ASSISTANT_RATE_LIMIT.maxConcurrentPerUid) {
      return { ok: false, message: '已有进行中的 AI 请求，请等待完成', code: 'CONCURRENT_LIMIT' };
    }

    return { ok: true };
  }

  static acquireConcurrent(uid: number): void {
    const n = uidConcurrent.get(uid) || 0;
    uidConcurrent.set(uid, n + 1);
  }

  static releaseConcurrent(uid: number): void {
    const n = uidConcurrent.get(uid) || 0;
    if (n <= 1) uidConcurrent.delete(uid);
    else uidConcurrent.set(uid, n - 1);
  }

  static recordLocalUnrelatedHit(uid: number): void {
    const now = Date.now();
    const state = uidUnrelatedHits.get(uid) || { hits: [], cooldownUntil: 0 };
    state.hits = pruneOldHits(state.hits, ASSISTANT_RATE_LIMIT.unrelatedHitWindowMs, now);
    state.hits.push(now);
    if (state.hits.length >= ASSISTANT_RATE_LIMIT.unrelatedHitsBeforeCooldown) {
      state.cooldownUntil = now + ASSISTANT_RATE_LIMIT.unrelatedCooldownMs;
      state.hits = [];
    }
    uidUnrelatedHits.set(uid, state);
  }
}

export function resolveClientIp(handler: { request?: { ip?: string; headers?: Record<string, string> } }): string {
  const xf = handler.request?.headers?.['x-forwarded-for'] || handler.request?.headers?.['X-Forwarded-For'];
  if (xf) return String(xf).split(',')[0].trim();
  return String(handler.request?.ip || 'unknown');
}
