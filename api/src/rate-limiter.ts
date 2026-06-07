export interface RateLimiterConfig {
  max: number;
  windowSeconds: number;
}

export class InMemoryRateLimiter {
  private buckets = new Map<string, { count: number; windowStart: number }>();
  constructor(private readonly config: RateLimiterConfig) {}

  consume(key: string): boolean {
    const now = Date.now();
    const windowMs = this.config.windowSeconds * 1000;
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (bucket.count >= this.config.max) {
      return false;
    }
    bucket.count++;
    return true;
  }
}
