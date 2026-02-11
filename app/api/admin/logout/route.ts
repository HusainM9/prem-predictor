import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/admin/requireAdmin";

/**
 * POST: Clears the admin session cookie. Use after "Log out" so the same browser requires the secret again.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 0,
  });
  return res;
}
