import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  aggregatePointsByUser,
  buildLeaderboardPage,
  parseLeaderboardPagination,
  type PredictionRow,
} from "@/lib/leaderboard";
import { getClientId, isRateLimited } from "@/lib/rate-limit";

const MAX_PAGE_SIZE = 50;

/**
 * Return users ordered by total points, one prediction applies everywhere for now. Filter by  gameweek. Filter by display name.
 */
export async function GET(req: Request) {
  try {
    const clientId = getClientId(req);
    if (isRateLimited(clientId, 60, 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const { searchParams } = new URL(req.url);
    const leagueId = searchParams.get("leagueId") ?? undefined;
    const gameweekParam = searchParams.get("gameweek");
    const gameweekNum =
      gameweekParam != null && gameweekParam !== "" ? Number(gameweekParam) : undefined;
    const gameweek =
      gameweekNum != null && Number.isInteger(gameweekNum) && gameweekNum >= 1 ? gameweekNum : undefined;
    const { limit: limitParam, offset: offsetParam } = parseLeaderboardPagination(
      searchParams.get("limit"),
      searchParams.get("offset"),
      MAX_PAGE_SIZE
    );
    const search = (searchParams.get("search") ?? "").trim();

    // Use only global predictions one prediction applies to global and all leagues
    const query = supabase
      .from("predictions")
      .select("user_id, points_awarded, bonus_exact_score_points, fixture_id")
      .not("settled_at", "is", null)
      .is("league_id", null);

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let filtered = (rows ?? []) as PredictionRow[];

    let league_name: string | null = null;
    if (leagueId != null && leagueId !== "") {
      const { data: league } = await supabase
        .from("leagues")
        .select("name")
        .eq("id", leagueId)
        .maybeSingle();
      league_name = league?.name ?? null;
      const { data: members } = await supabase
        .from("league_members")
        .select("user_id")
        .eq("league_id", leagueId);
      const memberIds = new Set((members ?? []).map((m) => m.user_id));
      filtered = filtered.filter((r) => memberIds.has(r.user_id));
    }

    if (gameweek != null && filtered.length > 0) {
      const fixtureIds = [...new Set(filtered.map((r) => r.fixture_id))];
      const { data: fixtures } = await supabase
        .from("fixtures")
        .select("id, gameweek")
        .in("id", fixtureIds);
      const gwSet = new Set(
        (fixtures ?? []).filter((f) => f.gameweek === gameweek).map((f) => f.id)
      );
      filtered = filtered.filter((r) => gwSet.has(r.fixture_id));
    }

    let sorted = aggregatePointsByUser(filtered);
    const userIds = sorted.map((e) => e.user_id);
    if (userIds.length === 0) {
      return NextResponse.json({
        entries: [],
        total_count: 0,
        leagueId: leagueId ?? null,
        league_name: league_name ?? null,
        gameweek: gameweek ?? null,
      });
    }

    // Add user_gameweek_bonuses (underdog +10, 7+ correct +10, all correct +50, 4+ exact +10)
    const bonusQuery = supabase
      .from("user_gameweek_bonuses")
      .select("user_id, points")
      .in("user_id", userIds);
    if (gameweek != null) {
      bonusQuery.eq("gameweek", gameweek);
    }
    const { data: bonusRows } = await bonusQuery;
    const bonusByUser = new Map<string, number>();
    for (const b of bonusRows ?? []) {
      const uid = b.user_id as string;
      bonusByUser.set(uid, (bonusByUser.get(uid) ?? 0) + (b.points ?? 0));
    }
    sorted = sorted
      .map((e) => ({ ...e, total_points: e.total_points + (bonusByUser.get(e.user_id) ?? 0) }))
      .sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
        return b.correct_scores - a.correct_scores;
      });

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, favourite_team")
      .in("id", userIds);
    const profileByUser = new Map<string, { display_name: string; favourite_team: string | null }>(
      (profiles ?? []).map((p) => [
        p.id,
        {
          display_name: p.display_name ?? "Player",
          favourite_team: p.favourite_team ?? null,
        },
      ])
    );
    for (const id of userIds) {
      if (!profileByUser.has(id)) {
        await supabase
          .from("profiles")
          .upsert(
            {
              id,
              display_name: "Player",
              favourite_team: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
        profileByUser.set(id, { display_name: "Player", favourite_team: null });
      }
    }

    const { entries: paginated, total_count } = buildLeaderboardPage(
      sorted,
      profileByUser,
      search,
      offsetParam,
      limitParam
    );

    return NextResponse.json({
      entries: paginated,
      total_count,
      leagueId: leagueId ?? null,
      league_name: league_name ?? null,
      gameweek: gameweek ?? null,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
