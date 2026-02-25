type Bucket = {
  count: number;
  resetAt: number;
};

class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  take(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || now >= existing.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      this.garbageCollect(now);
      return true;
    }

    if (existing.count >= limit) {
      return false;
    }

    existing.count += 1;
    return true;
  }

  private garbageCollect(now: number): void {
    if (this.buckets.size < 5000) return;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var botjamRateLimiter: InMemoryRateLimiter | undefined;
}

export const rateLimiter = globalThis.botjamRateLimiter ?? new InMemoryRateLimiter();
if (!globalThis.botjamRateLimiter) {
  globalThis.botjamRateLimiter = rateLimiter;
}

export const RATE_LIMITS = {
  commentsPerMinute: 8,
  eventsPerMinutePerToken: 240
} as const;
