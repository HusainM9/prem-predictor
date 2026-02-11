import { NextResponse } from "next/server";

const COOKIE_NAME = "admin_secret";

/**
 * Use at the start of admin API routes. If ADMIN_SECRET is set and the request
 * does not send it (via cookie "admin_secret" or Authorization: Bearer <secret>),
 * returns a 401 Response. Otherwise returns null and the route can continue.
 */
export function requireAdmin(req: Request): NextResponse | null {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return null;

  // --- Check cookie (e.g. from admin login page) or Bearer token ---
  const cookie = req.headers.get("cookie");
  const cookieMatch = cookie?.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const fromCookie = cookieMatch?.[1] ? decodeURIComponent(cookieMatch[1]) : null;
  const fromHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;

  if (fromCookie === secret || fromHeader === secret) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export { COOKIE_NAME };
