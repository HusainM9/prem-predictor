import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

const COOKIE_NAME = "admin_session";
const SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour – re-enter secret after expiry

/**
 * Create a signed session token (no secret in cookie). Cookie only holds expiry + HMAC.
 */
export function createAdminSessionToken(secret: string): string {
  const expiry = Date.now() + SESSION_MAX_AGE_MS;
  const hmac = createHmac("sha256", secret).update(String(expiry)).digest("hex");
  return `${expiry}.${hmac}`;
}

/**
 * Verify a signed session token. Returns true if valid and not expired.
 */
export function verifyAdminSessionToken(secret: string, token: string): boolean {
  const parts = token.trim().split(".");
  if (parts.length !== 2) return false;
  const [expiryStr, hmac] = parts;
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  const expected = createHmac("sha256", secret).update(String(expiry)).digest("hex");
  if (hmac.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * Use in admin API routes. Request must have valid admin session cookie or Bearer ADMIN_SECRET.
 * Secret is never stored in the cookie (only a signed session token). If ADMIN_SECRET is not set, returns 503.
 */
export function requireAdmin(req: Request): NextResponse | null {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET not configured" },
      { status: 503 }
    );
  }

  const cookie = req.headers.get("cookie");
  const cookieMatch = cookie?.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const sessionToken = cookieMatch?.[1] ? decodeURIComponent(cookieMatch[1].trim()) : null;
  const fromHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || null;

  if (sessionToken && verifyAdminSessionToken(secret, sessionToken)) return null;
  if (fromHeader === secret) return null; // Bearer token still allowed for scripts/API
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export { COOKIE_NAME, SESSION_MAX_AGE_MS };
