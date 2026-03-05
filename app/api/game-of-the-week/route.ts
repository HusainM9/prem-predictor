import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SEASON = "2025/26";

async function getLastVoteWinner(
  supabase: SupabaseClient,
  season: string
): Promise<{ gameweek: number; fixture_id: string; home_team: string; away_team: string } | null> {
  const nowIso = new Date().toISOString();
  const { data: lastFixture } = await supabase
    .from("fixtures")
    .select("gameweek, kickoff_time")
    .eq("season", season)
    .lte("kickoff_time", nowIso)
    .order("kickoff_time", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastFixture?.gameweek) return null;
  const closedGw = lastFixture.gameweek as number;
  const { data: gwFixtures } = await supabase
    .from("fixtures")
    .select("kickoff_time")
    .eq("season", season)
    .eq("gameweek", closedGw)
    .order("kickoff_time", { ascending: true });
  const firstKickoff = (gwFixtures ?? [])[0]?.kickoff_time ?? null;
  if (!firstKickoff) return null;
  const { data: votes } = await supabase
    .from("game_of_the_week_votes")
    .select("fixture_id")
    .eq("season", season)
    .eq("gameweek", closedGw)
    .lt("created_at", firstKickoff);
  if (!votes?.length) return null;
  const countByFixture = new Map<string, number>();
  for (const v of votes as { fixture_id: string }[]) {
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
  if (!winnerId) return null;
  const { data: fixture } = await supabase
    .from("fixtures")
    .select("id, home_team, away_team")
    .eq("id", winnerId)
    .maybeSingle();
  if (!fixture) return null;
  return {
    gameweek: closedGw,
    fixture_id: fixture.id,
    home_team: (fixture as { home_team: string }).home_team,
    away_team: (fixture as { away_team: string }).away_team,
  };
}

/**
 * GET: Fixtures for the given gameweek (or current), whether voting is open, and the current user's vote.
 * Query: ?gameweek=26&season=2025/26
 */
export async function GET(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    const nowIso = new Date().toISOString();
    const { searchParams } = new URL(req.url);
    const gameweekParam = searchParams.get("gameweek");
    const season = (searchParams.get("season") ?? DEFAULT_SEASON) as string;
    let gameweek: number;
    if (gameweekParam != null && Number.isInteger(Number(gameweekParam)) && Number(gameweekParam) >= 1) {
      gameweek = Number(gameweekParam);
    } else {
      const { data: next } = await supabase
        .from("fixtures")
        .select("gameweek, kickoff_time")
        .eq("season", season)
        .gte("kickoff_time", nowIso)
        .order("kickoff_time", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!next?.gameweek) {
        return NextResponse.json({
          voting_open: false,
          first_kickoff: null,
          fixtures: [],
          my_vote_fixture_id: null,
          gameweek: null,
          season,
          last_vote_winner: await getLastVoteWinner(supabase, season),
        });
      }
      let votingGw = next.gameweek as number;
      const { data: gwFixtures } = await supabase
        .from("fixtures")
        .select("kickoff_time")
        .eq("season", season)
        .eq("gameweek", votingGw)
        .order("kickoff_time", { ascending: true });
      const firstKickoffThisGw = (gwFixtures ?? [])[0]?.kickoff_time ?? null;
      if (firstKickoffThisGw && nowIso >= firstKickoffThisGw) {
        votingGw = votingGw + 1;
      }
      gameweek = votingGw;
    }

    const { data: fixtures, error: fxErr } = await supabase
      .from("fixtures")
      .select("id, home_team, away_team, kickoff_time")
      .eq("season", season)
      .eq("gameweek", gameweek)
      .order("kickoff_time", { ascending: true });
    if (fxErr) {
      return NextResponse.json({ error: fxErr.message }, { status: 500 });
    }
    const list = fixtures ?? [];
    const firstKickoff = list[0]?.kickoff_time ?? null;
    const voting_open =
      firstKickoff == null
        ? true
        : Date.now() < new Date(firstKickoff).getTime() - 24 * 60 * 60 * 1000;

    const { data: myVote } = await supabase
      .from("game_of_the_week_votes")
      .select("fixture_id")
      .eq("user_id", user.id)
      .eq("season", season)
      .eq("gameweek", gameweek)
      .maybeSingle();

    const last_vote_winner = await getLastVoteWinner(supabase, season);

    return NextResponse.json({
      voting_open,
      first_kickoff: firstKickoff,
      fixtures: list.map((f: { id: string; home_team: string; away_team: string; kickoff_time: string }) => ({
        id: f.id,
        home_team: f.home_team,
        away_team: f.away_team,
        kickoff_time: f.kickoff_time,
      })),
      my_vote_fixture_id: (myVote as { fixture_id?: string } | null)?.fixture_id ?? null,
      gameweek,
      season,
      last_vote_winner,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 500 }
    );
  }
}
