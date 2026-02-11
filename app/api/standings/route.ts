import { NextResponse } from "next/server";
import { getClientId, isRateLimited } from "@/lib/rate-limit";

/**
 * GET: returns Premier League standings from Football-Data.org (proxied so token stays server-side).
 * Rate limited to 30 requests per minute per IP to protect Football-Data quota.
 */
export async function GET(req: Request) {
  const clientId = getClientId(req);
  if (isRateLimited(clientId)) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const token = process.env.FOOTBALL_DATA_API_KEY;
  if (!token) {
    return NextResponse.json({ error: "FOOTBALL_DATA_API_KEY not set" }, { status: 500 });
  }
  const res = await fetch("https://api.football-data.org/v4/competitions/PL/standings", {
    headers: { "X-Auth-Token": token },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: "Standings request failed", status: res.status, body: text },
      { status: 500 }
    );
  }
  const data = JSON.parse(text);
  return NextResponse.json(data);
}
