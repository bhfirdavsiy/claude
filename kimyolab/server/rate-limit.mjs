// Fixed-window in-memory rate limiter keyed by client + route. Suitable for a single
// process deployment; put a shared limiter in front when running multiple instances.
export function createRateLimiter({windowMs, max, now = () => Date.now()}) {
  const buckets = new Map();
  return {
    take(key) {
      const t = now();
      let bucket = buckets.get(key);
      if (!bucket || t >= bucket.resetAt) {
        bucket = {count: 0, resetAt: t + windowMs};
        buckets.set(key, bucket);
      }
      bucket.count++;
      if (buckets.size > 10_000) for (const [k, b] of buckets) if (t >= b.resetAt) buckets.delete(k);
      return {allowed: bucket.count <= max, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - t) / 1000))};
    },
  };
}
