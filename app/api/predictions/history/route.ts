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
    const { data: fixtures, error: fxErr } = await supabase
      .from("fixtures")
      .select("id, home_team, away_team, kickoff_time, gameweek, status, home_goals, away_goals")
      .in("id", fixtureIds);

    if (fxErr) {
      return NextResponse.json({ error: fxErr.message }, { status: 500 });
    }
    const fixtureMap = new Map((fixtures ?? []).map((f) => [f.id, f]));

    let list = predictions.map((p) => {
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

    const byGameweek = new Map<number, typeof list>();
    for (const item of list) {
      const gw = item.fixture?.gameweek ?? 0;
      if (!byGameweek.has(gw)) byGameweek.set(gw, []);
      byGameweek.get(gw)!.push(item);
    }

    return NextResponse.json({
      predictions: list,
      by_gameweek: Object.fromEntries(
        [...byGameweek.entries()].map(([gw, arr]) => [
          gw,
          {
            predictions: arr,
            total_points: arr.reduce((s, x) => s + x.total_points, 0),
          },
        ])
      ),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
