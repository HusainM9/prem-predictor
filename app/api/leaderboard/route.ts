import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  aggregatePointsByUser,
  buildLeaderboardPage,
  parseLeaderboardPagination,
  type PredictionRow,
} from "@/lib/leaderboard";

const MAX_PAGE_SIZE = 50;

/**
 * Return users ordered by total points, one prediction applies everywhere for now. Filter by  gameweek. Filter by display name.
 */
export async function GET(req: Request) {
  try {
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

    const sorted = aggregatePointsByUser(filtered);
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

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    const nameByUser = new Map<string, string>(
      (profiles ?? []).map((p) => [p.id, p.display_name ?? "Player"])
    );
    for (const id of userIds) {
      if (!nameByUser.has(id)) {
        await supabase
          .from("profiles")
          .upsert(
            { id, display_name: "Player", updated_at: new Date().toISOString() },
            { onConflict: "id" }
          );
        nameByUser.set(id, "Player");
      }
    }

    const { entries: paginated, total_count } = buildLeaderboardPage(
      sorted,
      nameByUser,
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
