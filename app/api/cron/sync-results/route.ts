import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncResultsFromFootballData } from "@/lib/sync-results";
import { getGotwAnchorKickoffMs } from "@/lib/gotw-close";

const DEFAULT_SEASON = "2025/26";

async function settleGotwAtTMinus23h(supabaseUrl: string, serviceKey: string, season: string) {
  const supabase = createClient(supabaseUrl, serviceKey);
  const nowIso = new Date().toISOString();

  const { data: next } = await supabase
    .from("fixtures")
    .select("gameweek, kickoff_time")
    .eq("season", season)
    .gte("kickoff_time", nowIso)
    .order("kickoff_time", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!next?.gameweek) {
    return { settled: false, reason: "no_upcoming_fixtures" as const };
  }

  const gameweek = next.gameweek as number;
  const { data: gwFixtures } = await supabase
    .from("fixtures")
    .select("id, kickoff_time")
    .eq("season", season)
    .eq("gameweek", gameweek)
    .neq("status", "postponed")
    .order("kickoff_time", { ascending: true });
  const list = gwFixtures ?? [];
  const kickoffs = list.map((f: { kickoff_time: string }) => f.kickoff_time);
  const firstMs = getGotwAnchorKickoffMs(kickoffs);
  if (firstMs == null) {
    return { settled: false, reason: "no_fixtures_for_gameweek" as const, gameweek };
  }

  const closingMs = firstMs - 24 * 60 * 60 * 1000;
  const settleMs = firstMs - 23 * 60 * 60 * 1000;
  const nowMs = Date.now();

  if (nowMs < settleMs) {
    return {
      settled: false,
      reason: "too_early_before_t_minus_23h" as const,
      gameweek,
      settles_at: new Date(settleMs).toISOString(),
    };
  }
  if (nowMs >= firstMs) {
    return { settled: false, reason: "kickoff_already_started" as const, gameweek };
  }

  const fixtureIds = new Set(list.map((f: { id: string }) => f.id));
  const { data: votes } = await supabase
    .from("game_of_the_week_votes")
    .select("fixture_id")
    .eq("season", season)
    .eq("gameweek", gameweek)
    .lt("created_at", new Date(closingMs).toISOString());
  if (!votes?.length) {
    return { settled: false, reason: "no_votes_before_close" as const, gameweek };
  }

  const countByFixture = new Map<string, number>();
  for (const v of votes as { fixture_id: string }[]) {
    if (!fixtureIds.has(v.fixture_id)) continue;
    countByFixture.set(v.fixture_id, (countByFixture.get(v.fixture_id) ?? 0) + 1);
  }

  let winnerId: string | null = null;
  let maxCount = 0;
  for (const [fid, c] of countByFixture) {
    if (c > maxCount) {
      maxCount = c;
      winnerId = fid;
    }
  }
  if (!winnerId) {
    return { settled: false, reason: "no_valid_votes_for_fixtures" as const, gameweek };
  }

  const { data: fixture } = await supabase
    .from("fixtures")
    .select("id, home_team, away_team")
    .eq("id", winnerId)
    .maybeSingle();
  if (!fixture) {
    return { settled: false, reason: "winner_fixture_missing" as const, gameweek, winner_id: winnerId };
  }

  return {
    settled: true,
    gameweek,
    fixture_id: fixture.id,
    home_team: (fixture as { home_team: string }).home_team,
    away_team: (fixture as { away_team: string }).away_team,
    votes: maxCount,
  };
}


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

  const token = process.env.FOOTBALL_DATA_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token) {
    return NextResponse.json({ error: "FOOTBALL_DATA_API_KEY is not set" }, { status: 500 });
  }
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 500 });
  }

  const now = new Date();
  const { searchParams } = new URL(req.url);
  const season = searchParams.get("season") ?? DEFAULT_SEASON;
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const [result, gotw] = await Promise.all([
      syncResultsFromFootballData({
        dateFrom: threeDaysAgo,
        dateTo: tomorrow,
        supabaseUrl,
        serviceKey,
        footballDataToken: token,
      }),
      settleGotwAtTMinus23h(supabaseUrl, serviceKey, season),
    ]);
    return NextResponse.json({ success: true, season, ...result, gotw_settle: gotw });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
