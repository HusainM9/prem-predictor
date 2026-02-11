import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/leaderboard?leagueId=uuid&gameweek=number
 * Returns users ordered by total points (sum of points_awarded + bonus_exact_score_points).
 * - leagueId: optional; filter by league. Omit for global leaderboard.
 * - gameweek: optional; filter by fixture gameweek (requires join to fixtures).
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

    // Only settled predictions have points. sum points_awarded + bonus_exact_score_points 
    let query = supabase
      .from("predictions")
      .select("user_id, points_awarded, bonus_exact_score_points, fixture_id")
      .not("settled_at", "is", null);

    if (leagueId != null && leagueId !== "") {
      query = query.eq("league_id", leagueId);
    }

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!rows?.length) {
      return NextResponse.json({ entries: [], leagueId: leagueId ?? null, gameweek: gameweek ?? null });
    }

    // --- If gameweek filter: load fixtures for these prediction rows, keep only that gameweek ---
    let filtered = rows as { user_id: string; points_awarded: number | null; bonus_exact_score_points: number | null; fixture_id: string }[];
    if (gameweek != null) {
      const fixtureIds = [...new Set(filtered.map((r) => r.fixture_id))];
      const { data: fixtures } = await supabase
        .from("fixtures")
        .select("id, gameweek")
        .in("id", fixtureIds);
      const gwSet = new Set((fixtures ?? []).filter((f) => f.gameweek === gameweek).map((f) => f.id));
      filtered = filtered.filter((r) => gwSet.has(r.fixture_id));
    }

    // --- Sum points per user, then sort descending and assign rank 1, 2, 3... ---
    const byUser = new Map<string, number>();
    for (const r of filtered) {
      const total = (r.points_awarded ?? 0) + (r.bonus_exact_score_points ?? 0);
      byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + total);
    }

    const sorted = [...byUser.entries()]
      .map(([user_id, total_points]) => ({ user_id, total_points }))
      .sort((a, b) => b.total_points - a.total_points);

    const userIds = sorted.map((e) => e.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    const nameByUser = new Map<string, string>(
      (profiles ?? []).map((p) => [p.id, p.display_name ?? "Player"])
    );
    for (const id of userIds) {
      if (!nameByUser.has(id)) {
        await supabase.from("profiles").upsert({ id, display_name: "Player", updated_at: new Date().toISOString() }, { onConflict: "id" });
        nameByUser.set(id, "Player");
      }
    }

    const entries = sorted.map((e, i) => ({
      rank: i + 1,
      user_id: e.user_id,
      display_name: nameByUser.get(e.user_id) ?? "Player",
      total_points: e.total_points,
    }));

    return NextResponse.json({
      entries,
      leagueId: leagueId ?? null,
      gameweek: gameweek ?? null,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
