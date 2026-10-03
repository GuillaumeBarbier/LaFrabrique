// In-memory sliding window, per key (IP). One process (ADR-0001), so memory is enough.

interface Bucket {
  hits: number[];
}

const store = new Map<string, Bucket>();

export function isRateLimited(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const bucket = store.get(key);
  if (!bucket) return false;
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  return bucket.hits.length >= limit;
}

export function recordHit(key: string, now = Date.now()): void {
  const bucket = store.get(key) ?? { hits: [] };
  bucket.hits.push(now);
  store.set(key, bucket);
}

export function clearHits(key: string): void {
  store.delete(key);
}
