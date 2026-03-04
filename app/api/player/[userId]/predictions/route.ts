import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getClientId, isRateLimited } from "@/lib/rate-limit";

/** UUID v4 pattern (Supabase auth user ids). */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/player/[userId]/predictions
 * Returns that user's predictions only for fixtures where kickoff_time has passed.
 * Query: ?gameweek=N to filter by gameweek (no "all" - omit for all, or pass N for one GW).
 * Returns total_points (all past), gameweek_points (for filtered list), current_gameweek.
 * Rate limited (60/min per IP). Rejects non-UUID userId.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const clientId = getClientId(req);
    if (isRateLimited(clientId, 60, 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const { userId } = await params;
    const id = userId?.trim();
    if (!id) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid userId format" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const gameweekParam = searchParams.get("gameweek");
    const gameweek =
      gameweekParam != null && gameweekParam !== ""
        ? (() => {
            const n = Number(gameweekParam);
            return Number.isInteger(n) && n >= 1 ? n : null;
          })()
        : null;

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const nowIso = new Date().toISOString();

    const { data: predictions, error: predErr } = await supabase
      .from("predictions")
      .select("id, fixture_id, pred_home_goals, pred_away_goals, pick, points_awarded, bonus_exact_score_points, settled_at")
      .eq("user_id", id)
      .is("league_id", null)
      .order("submitted_at", { ascending: false });

    if (predErr) {
      return NextResponse.json({ error: predErr.message }, { status: 500 });
    }
    if (!predictions?.length) {
      return NextResponse.json({ predictions: [], fixtures: [] });
    }

    const fixtureIds = [...new Set(predictions.map((p) => p.fixture_id))];

    const { data: fixtures, error: fxErr } = await supabase
      .from("fixtures")
      .select("id, home_team, away_team, kickoff_time, gameweek, status, home_goals, away_goals")
      .in("id", fixtureIds)
      .lt("kickoff_time", nowIso);

    if (fxErr) {
      return NextResponse.json({ error: fxErr.message }, { status: 500 });
    }

    const pastFixtureIds = new Set((fixtures ?? []).map((f) => f.id));
    const allPast = predictions.filter((p) => pastFixtureIds.has(p.fixture_id));
    const fixtureMap = new Map((fixtures ?? []).map((f) => [f.id, f]));

    const total_points = allPast.reduce(
      (sum, p) => sum + (p.points_awarded ?? 0) + (p.bonus_exact_score_points ?? 0),
      0
    );

    let filtered = allPast;
    if (gameweek != null) {
      const gwFixtureIds = new Set(
        (fixtures ?? []).filter((f) => f.gameweek === gameweek).map((f) => f.id)
      );
      filtered = filtered.filter((p) => gwFixtureIds.has(p.fixture_id));
    }

    const gameweek_points = filtered.reduce(
      (sum, p) => sum + (p.points_awarded ?? 0) + (p.bonus_exact_score_points ?? 0),
      0
    );

    const list = filtered.map((p) => {
      const f = fixtureMap.get(p.fixture_id);
      return {
        prediction_id: p.id,
        fixture_id: p.fixture_id,
        pred_home_goals: p.pred_home_goals,
        pred_away_goals: p.pred_away_goals,
        pick: p.pick,
        points_awarded: p.points_awarded ?? 0,
        bonus_exact_score_points: p.bonus_exact_score_points ?? 0,
        settled_at: p.settled_at,
        fixture: f
          ? {
              home_team: f.home_team,
              away_team: f.away_team,
              kickoff_time: f.kickoff_time,
              gameweek: f.gameweek,
              status: f.status,
              home_goals: f.home_goals,
              away_goals: f.away_goals,
            }
          : null,
      };
    });

    list.sort((a, b) => {
      const tA = a.fixture?.kickoff_time ?? "";
      const tB = b.fixture?.kickoff_time ?? "";
      return tB.localeCompare(tA);
    });

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", id)
      .maybeSingle();
    const display_name = profile?.display_name ?? null;

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
      display_name,
      total_points,
      gameweek_points,
      current_gameweek,
      gameweek: gameweek ?? null,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
