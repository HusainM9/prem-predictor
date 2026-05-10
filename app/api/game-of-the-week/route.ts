import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGotwAnchorKickoffIso, getGotwVoteCloseMs } from "@/lib/gotw-close";

const DEFAULT_SEASON = "2025/26";

async function getWinnerForGameweek(
  supabase: SupabaseClient,
  season: string,
  gameweek: number
): Promise<{ gameweek: number; fixture_id: string; home_team: string; away_team: string } | null> {
  const { data: gwFixtures } = await supabase
    .from("fixtures")
    .select("id, kickoff_time")
    .eq("season", season)
    .eq("gameweek", gameweek)
    .neq("status", "postponed")
    .order("kickoff_time", { ascending: true });
  const kickoffs = (gwFixtures ?? []).map((f: { kickoff_time: string }) => f.kickoff_time);
  const closeMs = getGotwVoteCloseMs(kickoffs);
  if (closeMs == null) return null;

  const fixtureIds = new Set((gwFixtures ?? []).map((f: { id: string }) => f.id));
  const idList = [...fixtureIds];
  if (idList.length === 0) return null;
  // Count votes by fixture in this GW — do not require vote.gameweek to match (fixes bad rows saved as wrong GW).
  const { data: voteRows } = await supabase
    .from("game_of_the_week_votes")
    .select("fixture_id, created_at")
    .eq("season", season)
    .in("fixture_id", idList);
  // Same rule as vote POST: eligible iff vote time is strictly before close instant (use JS ms — avoids .lt + ISO quirks in Postgres).
  const votes = (voteRows ?? []).filter((v: { fixture_id: string; created_at: string }) => {
    const t = new Date(v.created_at).getTime();
    return !Number.isNaN(t) && t < closeMs;
  });
  if (!votes.length) return null;

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
  if (!winnerId) return null;
  const { data: fixture } = await supabase
    .from("fixtures")
    .select("id, home_team, away_team")
    .eq("id", winnerId)
    .maybeSingle();
  if (!fixture) return null;
  return {
    gameweek,
    fixture_id: fixture.id,
    home_team: (fixture as { home_team: string }).home_team,
    away_team: (fixture as { away_team: string }).away_team,
  };
}

/** Earliest non-postponed kickoff in the GW → vote close = 24h before that. */
async function getVoteCloseMsForGameweek(
  supabase: SupabaseClient,
  season: string,
  gameweek: number
): Promise<number | null> {
  const { data: gwFixtures } = await supabase
    .from("fixtures")
    .select("kickoff_time")
    .eq("season", season)
    .eq("gameweek", gameweek)
    .neq("status", "postponed")
    .order("kickoff_time", { ascending: true });
  const firstKickoff = (gwFixtures ?? [])[0]?.kickoff_time ?? null;
  if (!firstKickoff) return null;
  return new Date(firstKickoff).getTime() - 24 * 60 * 60 * 1000;
}

/**
 * Most recent gameweek below `currentGameweek` where voting has closed, plus that GW's winner.
 * Does not skip to older GWs when the winner is null (avoids showing GW30 when GW31 is settled but tally was empty).
 */
async function getLastSettledGotwContext(
  supabase: SupabaseClient,
  season: string,
  currentGameweek: number | null
): Promise<{
  last_settled_gameweek: number | null;
  last_vote_winner: { gameweek: number; fixture_id: string; home_team: string; away_team: string } | null;
}> {
  const now = Date.now();

  let settledGw: number | null = null;

  if (currentGameweek != null && currentGameweek > 1) {
    for (let g = currentGameweek - 1; g >= 1; g--) {
      const closeMs = await getVoteCloseMsForGameweek(supabase, season, g);
      if (closeMs == null || now < closeMs) continue;
      settledGw = g;
      break;
    }
  } else {
    const { data: gwRows } = await supabase.from("fixtures").select("gameweek").eq("season", season);
    const distinct = [...new Set((gwRows ?? []).map((r: { gameweek: number }) => r.gameweek))].filter(
      (n) => Number.isInteger(n) && n >= 1
    );
    distinct.sort((a, b) => b - a);
    for (const g of distinct) {
      const closeMs = await getVoteCloseMsForGameweek(supabase, season, g);
      if (closeMs == null || now < closeMs) continue;
      settledGw = g;
      break;
    }
  }

  if (settledGw == null) {
    return { last_settled_gameweek: null, last_vote_winner: null };
  }
  const last_vote_winner = await getWinnerForGameweek(supabase, season, settledGw);
  return { last_settled_gameweek: settledGw, last_vote_winner };
}

/**
 * Fixtures for the given gameweek, whether voting is open, and the current user's vote.
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
        .eq("status", "scheduled")
        .gte("kickoff_time", nowIso)
        .order("kickoff_time", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!next?.gameweek) {
        const lastCtx = await getLastSettledGotwContext(supabase, season, null);
        return NextResponse.json({
          voting_open: false,
          first_kickoff: null,
          fixtures: [],
          my_vote_fixture_id: null,
          gameweek: null,
          season,
          last_settled_gameweek: lastCtx.last_settled_gameweek,
          last_vote_winner: lastCtx.last_vote_winner,
        });
      }

      let votingGw = next.gameweek as number;
      for (let i = 0; i < 6; i++) {
        const { data: gwFixtures } = await supabase
          .from("fixtures")
          .select("kickoff_time")
          .eq("season", season)
          .eq("gameweek", votingGw)
          .eq("status", "scheduled")
          .order("kickoff_time", { ascending: true });
        const kxs = (gwFixtures ?? []).map((r: { kickoff_time: string }) => r.kickoff_time);
        const closeMs = getGotwVoteCloseMs(kxs);
        if (closeMs == null) break;
        if (Date.now() < closeMs) break;
        votingGw = votingGw + 1;
      }
      gameweek = votingGw;
    }

    // Anchor kickoff = GOTW deadline anchor (median cluster; ignores rearranged early outliers).
    // Do NOT derive "settled" from only future scheduled fixtures — once the GW starts, those
    // rows disappear and users would never see current_vote_winner.
    const { data: gwFixturesAll, error: fxErr } = await supabase
      .from("fixtures")
      .select("id, home_team, away_team, kickoff_time, status")
      .eq("season", season)
      .eq("gameweek", gameweek)
      .neq("status", "postponed")
      .order("kickoff_time", { ascending: true });
    if (fxErr) {
      return NextResponse.json({ error: fxErr.message }, { status: 500 });
    }
    const gwAll = gwFixturesAll ?? [];
    const kickoffsAll = gwAll.map((f: { kickoff_time: string }) => f.kickoff_time);
    const firstKickoffCanonical = getGotwAnchorKickoffIso(kickoffsAll) ?? gwAll[0]?.kickoff_time ?? null;
    const closeMs = getGotwVoteCloseMs(kickoffsAll);

    const list = gwAll.filter(
      (f: { status: string; kickoff_time: string }) =>
        f.status === "scheduled" && f.kickoff_time >= nowIso
    );

    const voting_open = closeMs !== null && Date.now() < closeMs;

    const { data: myVote } = await supabase
      .from("game_of_the_week_votes")
      .select("fixture_id")
      .eq("user_id", user.id)
      .eq("season", season)
      .eq("gameweek", gameweek)
      .maybeSingle();

    const lastCtx = await getLastSettledGotwContext(supabase, season, gameweek);

    const current_vote_winner =
      closeMs !== null && Date.now() >= closeMs
        ? await getWinnerForGameweek(supabase, season, gameweek)
        : null;

    return NextResponse.json({
      voting_open,
      first_kickoff: firstKickoffCanonical,
      fixtures: list.map((f: { id: string; home_team: string; away_team: string; kickoff_time: string }) => ({
        id: f.id,
        home_team: f.home_team,
        away_team: f.away_team,
        kickoff_time: f.kickoff_time,
      })),
      my_vote_fixture_id: (myVote as { fixture_id?: string } | null)?.fixture_id ?? null,
      gameweek,
      season,
      current_vote_winner,
      last_settled_gameweek: lastCtx.last_settled_gameweek,
      last_vote_winner: lastCtx.last_vote_winner,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 500 }
    );
  }
}
