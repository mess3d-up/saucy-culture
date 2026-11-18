import { sql } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { getDb, hasDatabaseUrl, isProductionRuntime } from '../db/index';
import { extractRequestIp } from './auth';

export interface RateLimitRule {
  name: string;
  windowMs: number;
  maxRequests: number;
}

export const RATE_LIMITS = {
  globalApi: { name: 'global_api', windowMs: 60_000, maxRequests: 150 },
  orders: { name: 'orders', windowMs: 10 * 60_000, maxRequests: 8 },
  track: { name: 'track', windowMs: 15 * 60_000, maxRequests: 15 },
  circle: { name: 'circle', windowMs: 15 * 60_000, maxRequests: 6 },
  leads: { name: 'leads', windowMs: 15 * 60_000, maxRequests: 10 },
  restockAlerts: { name: 'restock_alerts', windowMs: 15 * 60_000, maxRequests: 10 },
  pushSubscribe: { name: 'push_subscribe', windowMs: 15 * 60_000, maxRequests: 10 },
} as const satisfies Record<string, RateLimitRule>;

interface MemoryBucket {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, MemoryBucket>();
let rateLimitTableReady = false;
let rateLimitTablePromise: Promise<void> | null = null;

async function ensureRateLimitTable(): Promise<void> {
  const db = getDb();
  if (!db || rateLimitTableReady) return;
  if (rateLimitTablePromise) return rateLimitTablePromise;

  rateLimitTablePromise = (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS rate_limits (
        bucket_key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        reset_at TIMESTAMPTZ NOT NULL
      )
    `);
    rateLimitTableReady = true;
  })();

  await rateLimitTablePromise;
}

export function normalizeClientIp(req: Request): string {
  const raw = extractRequestIp(req);
  return raw.replace(/^::ffff:/i, '').trim() || 'unknown';
}

export async function checkRateLimit(
  rule: RateLimitRule,
  ip: string
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number; resetAt: number }> {
  const now = Date.now();
  const bucketKey = `${rule.name}:${ip}`;
  const nextReset = new Date(now + rule.windowMs);

  if (hasDatabaseUrl()) {
    await ensureRateLimitTable();
    const db = getDb()!;
    const result = await db.execute(sql`
      INSERT INTO rate_limits (bucket_key, count, reset_at)
      VALUES (${bucketKey}, 1, ${nextReset})
      ON CONFLICT (bucket_key) DO UPDATE
      SET
        count = CASE WHEN rate_limits.reset_at <= NOW() THEN 1 ELSE rate_limits.count + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at <= NOW() THEN ${nextReset} ELSE rate_limits.reset_at END
      RETURNING count, reset_at
    `);

    const row = result.rows[0] as { count: number | string; reset_at: string | Date } | undefined;
    const count = Number(row?.count ?? 1);
    const resetAtMs = row?.reset_at ? new Date(row.reset_at).getTime() : nextReset.getTime();
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - now) / 1000));

    return {
      allowed: count <= rule.maxRequests,
      remaining: Math.max(0, rule.maxRequests - count),
      retryAfterSeconds,
      resetAt: resetAtMs,
    };
  }

  if (isProductionRuntime()) {
    throw new Error('FATAL: Rate limiting requires PostgreSQL in production.');
  }

  // Dev-only in-memory window fallback
  if (memoryBuckets.size > 2000) {
    for (const [k, v] of memoryBuckets.entries()) {
      if (v.resetAt <= now) memoryBuckets.delete(k);
    }
  }

  const existing = memoryBuckets.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + rule.windowMs;
    memoryBuckets.set(bucketKey, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, rule.maxRequests - 1),
      retryAfterSeconds: Math.ceil(rule.windowMs / 1000),
      resetAt,
    };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return {
    allowed: existing.count <= rule.maxRequests,
    remaining: Math.max(0, rule.maxRequests - existing.count),
    retryAfterSeconds,
    resetAt: existing.resetAt,
  };
}

export function rateLimitMiddleware(rule: RateLimitRule) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = normalizeClientIp(req);
      const outcome = await checkRateLimit(rule, ip);

      res.setHeader('X-RateLimit-Limit', String(rule.maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(outcome.remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(outcome.resetAt / 1000)));

      if (!outcome.allowed) {
        res.setHeader('Retry-After', String(outcome.retryAfterSeconds));
        res.status(429).json({
          error: `Too many requests. Please wait ${outcome.retryAfterSeconds}s and try again.`,
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export function isHoneypotTriggered(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  for (const field of ['website', 'company', 'hp_field']) {
    const val = record[field];
    if (typeof val === 'string' && val.trim().length > 0) {
      return true;
    }
  }
  return false;
}
