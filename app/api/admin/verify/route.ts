import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";

/**
 * GET: returns 200 if request has valid admin secret (cookie or header).
 */
export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  return NextResponse.json({ ok: true });
}
