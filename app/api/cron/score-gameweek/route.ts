import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_SEASON = "2025/26";
const ONE_HOUR_MS = 60 * 60 * 1000;

type DayFixture = {
  gameweek: number;
  kickoff_time: string;
  status: string;
  provider_last_updated: string | null;
};

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
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const nextDayStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const { data: todaysFixtures, error: dayErr } = await supabase
    .from("fixtures")
    .select("gameweek, kickoff_time, status, provider_last_updated")
    .eq("season", season)
    .gte("kickoff_time", dayStart.toISOString())
    .lt("kickoff_time", nextDayStart.toISOString());

  if (dayErr) {
    return NextResponse.json({ error: "Failed loading today's fixtures", details: dayErr.message }, { status: 500 });
  }

  const list = (todaysFixtures ?? []) as DayFixture[];
  if (list.length === 0) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "no_games_today",
      season,
      day_start_utc: dayStart.toISOString(),
    });
  }

  const allFinishedToday = list.every((f) => f.status === "finished");
  if (!allFinishedToday) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "day_matches_not_finished_yet",
      season,
      day_start_utc: dayStart.toISOString(),
    });
  }

  const finishedTimestamps = list.map((f) => f.provider_last_updated).filter((v): v is string => !!v);
  if (finishedTimestamps.length !== list.length) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "missing_finished_timestamps",
      season,
      day_start_utc: dayStart.toISOString(),
    });
  }

  const lastFinishedMs = finishedTimestamps.reduce((max, iso) => {
    const ms = new Date(iso).getTime();
    return ms > max ? ms : max;
  }, 0);
  const earliestRunMs = lastFinishedMs + ONE_HOUR_MS;
  if (Date.now() < earliestRunMs) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "too_early_after_last_finished_match",
      season,
      earliest_run_at: new Date(earliestRunMs).toISOString(),
    });
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.APP_URL || "http://localhost:3000";

  const gameweeks = [...new Set(list.map((f) => f.gameweek))].sort((a, b) => a - b);
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
      day_start_utc: dayStart.toISOString(),
      results,
    },
    { status: allOk ? 200 : 207 }
  );
}

