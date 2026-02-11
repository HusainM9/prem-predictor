import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/admin/requireAdmin";

/**
 * POST body: { secret }
 * If secret matches ADMIN_SECRET, sets httpOnly cookie and returns { ok: true }.
 */
export async function POST(req: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ADMIN_SECRET not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.secret !== secret) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, secret, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}
