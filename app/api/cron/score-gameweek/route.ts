import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_SEASON = "2025/26";
const LOOKBACK_HOURS = 72;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const querySecret = new URL(req.url).searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (bearer !== cronSecret && querySecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminSecret = process.env.ADMIN_SECRET?.trim();
  if (!adminSecret) {
    return NextResponse.json({ error: "ADMIN_SECRET is not set" }, { status: 500 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const { searchParams } = new URL(req.url);
  const season = searchParams.get("season") ?? DEFAULT_SEASON;
  const now = new Date();
  const sinceIso = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  const { data: recentFixtures, error: recentErr } = await supabase
    .from("fixtures")
    .select("gameweek")
    .eq("season", season)
    .gte("kickoff_time", sinceIso)
    .lte("kickoff_time", nowIso);

  if (recentErr) {
    return NextResponse.json({ error: "Failed loading recent fixtures", details: recentErr.message }, { status: 500 });
  }

  const gameweeks = [...new Set((recentFixtures ?? []).map((f) => f.gameweek as number))]
    .filter((gw) => Number.isInteger(gw) && gw >= 1)
    .sort((a, b) => b - a);

  if (gameweeks.length === 0) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "no_recent_fixtures",
      season,
      lookback_hours: LOOKBACK_HOURS,
    });
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.APP_URL || "http://localhost:3000";

  const results: Array<{
    gameweek: number;
    scored: boolean;
    status?: number;
    body?: unknown;
  }> = [];

  for (const gameweek of gameweeks) {
    const scoreRes = await fetch(`${baseUrl}/api/admin/score-gameweek`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ season, gameweek }),
      cache: "no-store",
    });
    const scoreBody = await scoreRes.json().catch(() => ({}));
    results.push({
      gameweek,
      scored: scoreRes.ok,
      status: scoreRes.status,
      body: scoreBody,
    });
  }

  const allOk = results.every((r) => r.scored);
  return NextResponse.json(
    {
      success: allOk,
      season,
      lookback_hours: LOOKBACK_HOURS,
      results,
    },
    { status: allOk ? 200 : 207 }
  );
}

