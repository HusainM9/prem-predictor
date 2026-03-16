import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/predictions/history
 * Returns the current user's past predictions with fixture details and points.
 * Requires Authorization: Bearer <access_token> (from supabase.auth.getSession()).
 * Query: ?gameweek=number (optional) to filter by gameweek.
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseAuth = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const { searchParams } = new URL(req.url);
    const gameweekParam = searchParams.get("gameweek");
    const gameweek = gameweekParam != null && gameweekParam !== "" ? Number(gameweekParam) : undefined;

    const { data: predictions, error: predErr } = await supabase
      .from("predictions")
      .select(`
        id,
        fixture_id,
        pred_home_goals,
        pred_away_goals,
        pick,
        points_awarded,
        bonus_exact_score_points,
        bonus_points,
        settled_at,
        submitted_at
      `)
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false });

    if (predErr) {
      return NextResponse.json({ error: predErr.message }, { status: 500 });
    }
    if (!predictions?.length) {
      return NextResponse.json({ predictions: [], fixtures: {} });
    }

    const fixtureIds = [...new Set(predictions.map((p) => p.fixture_id))];
    const nowIso = new Date().toISOString();
    const { data: fixtures, error: fxErr } = await supabase
      .from("fixtures")
      .select("id, home_team, away_team, kickoff_time, gameweek, status, home_goals, away_goals")
      .in("id", fixtureIds)
      .lt("kickoff_time", nowIso);

    if (fxErr) {
      return NextResponse.json({ error: fxErr.message }, { status: 500 });
    }
    const pastFixtureIds = new Set((fixtures ?? []).map((f) => f.id));
    const pastPredictions = predictions.filter((p) => pastFixtureIds.has(p.fixture_id));
    const fixtureMap = new Map((fixtures ?? []).map((f) => [f.id, f]));

    let list = pastPredictions.map((p) => {
      const fixture = fixtureMap.get(p.fixture_id);
      const totalPoints = (p.points_awarded ?? 0) + (p.bonus_exact_score_points ?? p.bonus_points ?? 0);
      return {
        prediction_id: p.id,
        fixture_id: p.fixture_id,
        pred_home_goals: p.pred_home_goals,
        pred_away_goals: p.pred_away_goals,
        pick: p.pick,
        points_awarded: p.points_awarded ?? 0,
        bonus_points: p.bonus_exact_score_points ?? p.bonus_points ?? 0,
        total_points: totalPoints,
        settled_at: p.settled_at,
        submitted_at: p.submitted_at,
        fixture: fixture
          ? {
              home_team: fixture.home_team,
              away_team: fixture.away_team,
              kickoff_time: fixture.kickoff_time,
              gameweek: fixture.gameweek,
              status: fixture.status,
              home_goals: fixture.home_goals,
              away_goals: fixture.away_goals,
            }
          : null,
      };
    });

    if (gameweek != null && Number.isInteger(gameweek)) {
      list = list.filter((item) => item.fixture?.gameweek === gameweek);
    }

    // Sort by kickoff desc (most recent first)
    list.sort((a, b) => {
      const tA = a.fixture?.kickoff_time ?? "";
      const tB = b.fixture?.kickoff_time ?? "";
      return tB.localeCompare(tA);
    });

    const byGameweek = new Map<number, { predictions: typeof list; total_points: number; bonuses: Array<{ bonus_type: string; points: number }> }>();
    for (const item of list) {
      const gw = item.fixture?.gameweek ?? 0;
      if (!byGameweek.has(gw)) {
        byGameweek.set(gw, { predictions: [], total_points: 0, bonuses: [] });
      }
      const entry = byGameweek.get(gw)!;
      entry.predictions.push(item);
      entry.total_points = entry.predictions.reduce((s, x) => s + x.total_points, 0);
    }

    const gameweeks = [...byGameweek.keys()];
    if (gameweeks.length > 0) {
      const { data: bonusRows } = await supabase
        .from("user_gameweek_bonuses")
        .select("gameweek, bonus_type, points")
        .eq("user_id", user.id)
        .in("gameweek", gameweeks);
      for (const b of bonusRows ?? []) {
        const gw = b.gameweek as number;
        const entry = byGameweek.get(gw);
        if (entry) {
          entry.bonuses.push({ bonus_type: b.bonus_type as string, points: b.points ?? 0 });
          entry.total_points += b.points ?? 0;
        }
      }
    }

    let current_gameweek: number | null = null;
    const { data: gwRow } = await supabase
      .from("fixtures")
      .select("gameweek")
      .eq("season", "2025/26")
      .lt("kickoff_time", nowIso)
      .order("kickoff_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (gwRow?.gameweek != null && Number.isInteger(gwRow.gameweek)) {
      current_gameweek = gwRow.gameweek;
    }

    return NextResponse.json({
      predictions: list,
      by_gameweek: Object.fromEntries(
        [...byGameweek.entries()].map(([gw, entry]) => [
          gw,
          {
            predictions: entry.predictions,
            total_points: entry.total_points,
            bonuses: entry.bonuses,
          },
        ])
      ),
      current_gameweek,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
