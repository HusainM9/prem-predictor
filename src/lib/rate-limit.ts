/**
 * In-memory rate limiter (per key). Use for single-instance/serverless; not shared across workers.
 * Sliding window: max `limit` requests per `windowMs` per key.
 */
const store = new Map<string, number[]>();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30;

function prune(key: string, now: number) {
  const timestamps = store.get(key) ?? [];
  const cutoff = now - WINDOW_MS;
  const kept = timestamps.filter((t) => t > cutoff);
  if (kept.length === 0) store.delete(key);
  else store.set(key, kept);
  return kept;
}

export function isRateLimited(key: string, limit = MAX_REQUESTS, windowMs = WINDOW_MS): boolean {
  const now = Date.now();
  const timestamps = store.get(key) ?? [];
  const cutoff = now - windowMs;
  const recent = timestamps.filter((t) => t > cutoff);
  if (recent.length >= limit) return true;
  recent.push(now);
  store.set(key, recent);
  return false;
}

/** Get client identifier from request (Vercel/proxy headers or fallback). */
export function getClientId(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
