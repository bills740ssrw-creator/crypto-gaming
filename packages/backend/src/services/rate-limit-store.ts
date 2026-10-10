import { redis } from './redis';

export interface RateLimitHit {
  count: number;
  ttl: number;
}

export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
}

interface MemoryEntry {
  count: number;
  expiresAt: number;
}

const memoryCounters = new Map<string, MemoryEntry>();
const MEMORY_SWEEP_THRESHOLD = 500;

function sweepMemoryCounters(now: number): void {
  for (const [key, entry] of memoryCounters) {
    if (entry.expiresAt <= now) memoryCounters.delete(key);
  }
}

export function memoryHit(key: string, windowMs: number, now: number = Date.now()): RateLimitHit {
  const existing = memoryCounters.get(key);
  if (!existing || existing.expiresAt <= now) {
    memoryCounters.set(key, { count: 1, expiresAt: now + windowMs });
    if (memoryCounters.size > MEMORY_SWEEP_THRESHOLD) sweepMemoryCounters(now);
    return { count: 1, ttl: windowMs };
  }
  existing.count += 1;
  return { count: existing.count, ttl: Math.max(1, existing.expiresAt - now) };
}

export function resetMemoryRateLimits(): void {
  memoryCounters.clear();
}

export function memoryRateLimitSize(): number {
  return memoryCounters.size;
}

export const memoryStore: RateLimitStore = {
  hit(key, windowMs) {
    return Promise.resolve(memoryHit(key, windowMs));
  },
};

/**
 * Prefers Redis so limits hold across processes. Mirrors the path-nonce
 * fallback: when Redis is unreachable the counter degrades to an in-process
 * map instead of silently disabling the limit.
 */
export const redisOrMemoryStore: RateLimitStore = {
  async hit(key, windowMs) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, windowMs);
      const ttl = await redis.pttl(key);
      return { count, ttl: ttl > 0 ? ttl : windowMs };
    } catch {
      return memoryHit(key, windowMs);
    }
  },
};

export function createRateLimitStore(): RateLimitStore {
  return redisOrMemoryStore;
}
