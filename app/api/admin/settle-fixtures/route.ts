import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { scorePrediction } from "@/lib/scoring/points";

// Settles a fixture with the final score and scores all open predictions
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
    const { fixtureId, homeGoals, awayGoals } = body;

    if (fixtureId == null || homeGoals == null || awayGoals == null) {
      return NextResponse.json(
        { error: "Missing fixtureId, homeGoals, or awayGoals" },
        { status: 400 }
      );
    }

    const h = Number(homeGoals);
    const a = Number(awayGoals);
    if (!Number.isInteger(h) || h < 0 || !Number.isInteger(a) || a < 0) {
      return NextResponse.json({ error: "Goals have to be non-negative integers" }, { status: 400 });
    }

    const { data: fixture, error: fxErr } = await supabase
      .from("fixtures")
      .select("id, status, odds_home_current, odds_draw_current, odds_away_current, odds_home, odds_draw, odds_away")
      .eq("id", fixtureId)
      .maybeSingle();

    if (fxErr || !fixture) {
      return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
    }

    const { error: updateFxErr } = await supabase
      .from("fixtures")
      .update({ status: "finished", home_goals: h, away_goals: a })
      .eq("id", fixtureId);

    if (updateFxErr) {
      return NextResponse.json({ error: "Couldn't update fixture", details: updateFxErr.message }, { status: 500 });
    }

    const { data: predictions, error: predErr } = await supabase
      .from("predictions")
      .select("id, pick, stake, locked_odds, pred_home_goals, pred_away_goals")
      .eq("fixture_id", fixtureId)
      .is("settled_at", null);

    if (predErr) {
      return NextResponse.json({ error: "Failed to load predictions: " + predErr.message }, { status: 500 });
    }

    const result = { home_goals: h, away_goals: a };
    let settled = 0;

    // use fixture's current odds when prediction has no locked_odds
    const oddsForPick = (pick: string) => {
      if (pick === "H") return fixture.odds_home_current ?? fixture.odds_home;
      if (pick === "D") return fixture.odds_draw_current ?? fixture.odds_draw;
      return fixture.odds_away_current ?? fixture.odds_away;
    };

    for (const p of predictions ?? []) {
      const rawFallback = oddsForPick(p.pick);
      const fallbackOdds = rawFallback != null && Number(rawFallback) > 0 ? Number(rawFallback) : undefined;
      const scored = scorePrediction(
        {
          pick: p.pick as "H" | "D" | "A",
          stake: Number(p.stake) || 10,
          locked_odds: p.locked_odds != null ? Number(p.locked_odds) : null,
          pred_home_goals: p.pred_home_goals,
          pred_away_goals: p.pred_away_goals,
        },
        result,
        { fallbackOdds }
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

      if (!updErr) settled++;
    }

    return NextResponse.json({
      success: true,
      fixtureId,
      result: { home_goals: h, away_goals: a },
      predictions_settled: settled,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Something went wrong", message }, { status: 500 });
  }
}
