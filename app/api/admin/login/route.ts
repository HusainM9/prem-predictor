import { NextResponse } from "next/server";
import { COOKIE_NAME, createAdminSessionToken } from "@/lib/admin/requireAdmin";

/**
 * POST body: { secret }
 * If secret matches ADMIN_SECRET, sets httpOnly cookie with a signed session token (secret is never stored in the cookie) and returns { ok: true }.
 * Session expires after 1 hour; you must re-enter the secret after that.
 */
export async function POST(req: Request) {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "ADMIN_SECRET not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const submitted = typeof body.secret === "string" ? body.secret.trim() : "";
  if (submitted !== secret) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const token = createAdminSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60, // 1 hour (matches SESSION_MAX_AGE_MS)
  });
  return res;
}
