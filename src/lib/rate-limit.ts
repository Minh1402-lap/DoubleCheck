type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();
export function rateLimit(key: string, limit = 5, windowMs = 60 * 60_000): boolean {
  const now = Date.now(); const current = buckets.get(key);
  if (!current || current.reset <= now) { buckets.set(key, { count: 1, reset: now + windowMs }); return true; }
  if (current.count >= limit) return false;
  current.count++; return true;
}
