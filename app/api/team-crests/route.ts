import { NextResponse } from "next/server";
import { getClientId, isRateLimited } from "@/lib/rate-limit";

/**
 * GET: returns team name → crest URL map from Premier League standings (Football-Data.org).
 * Used by TeamLogo to show crests like the league table page. Rate limited with standings.
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
    next: { revalidate: 300 },
  });
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: "Standings request failed", status: res.status, body: text },
      { status: 500 }
    );
  }

  const data = JSON.parse(text) as {
    standings?: Array<{ type: string; table?: Array<{ team?: { name?: string; crest?: string } }> }>;
  };
  const crests: Record<string, string> = {};
  const total = data.standings?.find((s) => s.type === "TOTAL");
  for (const row of total?.table ?? []) {
    const name = row.team?.name;
    const crest = row.team?.crest;
    if (name && crest) crests[name] = crest;
  }

  return NextResponse.json({ crests });
}
