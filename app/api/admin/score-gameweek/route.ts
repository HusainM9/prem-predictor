import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { scorePrediction } from "@/lib/scoring/points";

const DEFAULT_SEASON = "2025/26";

/**
 * Settles all unsettled predictions for finished fixtures in the given (or "current") gameweek.
 * Idempotent: only predictions with settled_at null are updated.
 */
export async function POST(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const season = body.season ?? DEFAULT_SEASON;
    const useCurrent = body.gameweek == null || body.gameweek === "current";

    // Resolve gameweek: "current" = gameweek of the most recently finished fixture (by kickoff),
    // so early-played gameweeks (e.g. GW31 rescheduled) don't override the real current GW.
    let gameweek: number;
    if (!useCurrent && Number.isInteger(Number(body.gameweek)) && Number(body.gameweek) >= 1) {
      gameweek = Number(body.gameweek);
    } else {
      const { data: latestFinished } = await supabase
        .from("fixtures")
        .select("gameweek")
        .eq("season", season)
        .eq("status", "finished")
        .order("kickoff_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      const resolved = latestFinished?.gameweek;
      if (resolved == null) {
        return NextResponse.json(
          { error: "No finished gameweek found. Set fixture results and status=finished, or send { \"gameweek\": 26 }" },
          { status: 400 }
        );
      }
      gameweek = resolved;
    }

    // Load all finished fixtures in this gameweek (with odds for fallback when prediction.locked_odds is null)
    const { data: fixtures, error: fxErr } = await supabase
      .from("fixtures")
      .select("id, home_goals, away_goals, odds_home_current, odds_draw_current, odds_away_current, odds_home, odds_draw, odds_away")
      .eq("season", season)
      .eq("gameweek", gameweek)
      .eq("status", "finished");

    if (fxErr) {
      return NextResponse.json({ error: "Failed to load fixtures: " + fxErr.message }, { status: 500 });
    }

    if (!fixtures?.length) {
      return NextResponse.json({
        success: true,
        season,
        gameweek,
        message: "No finished fixtures in this gameweek",
        fixtures_processed: 0,
        predictions_settled: 0,
      });
    }

    let totalSettled = 0;

    for (const fixture of fixtures) {
      const home_goals = fixture.home_goals ?? 0;
      const away_goals = fixture.away_goals ?? 0;

      // Unsettled predictions for this fixture
      const { data: predictions, error: predErr } = await supabase
        .from("predictions")
        .select("id, pick, stake, locked_odds, pred_home_goals, pred_away_goals")
        .eq("fixture_id", fixture.id)
        .is("settled_at", null);

      if (predErr) continue;

      const result = { home_goals, away_goals };

      for (const p of predictions ?? []) {
        const scored = scorePrediction(
          {
            pick: p.pick as "H" | "D" | "A",
            stake: Number(p.stake) || 10,
            locked_odds: p.locked_odds != null ? Number(p.locked_odds) : null,
            pred_home_goals: p.pred_home_goals,
            pred_away_goals: p.pred_away_goals,
          },
          result
        );

        const { error: updErr } = await supabase
          .from("predictions")
          .update({
            points_awarded: scored.points_awarded,
            bonus_exact_score_points: scored.bonus_exact_score_points,
            bonus_points: scored.bonus_points,
            settled_at: new Date().toISOString(),
          })
          .eq("id", p.id);

        if (!updErr) totalSettled++;
      }
    }

    return NextResponse.json({
      success: true,
      season,
      gameweek,
      fixtures_processed: fixtures.length,
      predictions_settled: totalSettled,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Route crashed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
