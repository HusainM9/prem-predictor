import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { resyncSingleFixture } from "@/lib/sync-results";
import { scorePrediction } from "@/lib/scoring/points";

/**
 * Admin-only: Re-fetch a single fixture from Football-Data.org (single match + competition list),
 * apply stuck/replacement logic, update the fixture, and if it is now FINISHED with a score, settle predictions.
 * POST body: { fixtureId: string }
 */
export async function POST(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const token = process.env.FOOTBALL_DATA_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!token) return NextResponse.json({ error: "Missing FOOTBALL_DATA_API_KEY" }, { status: 500 });
    if (!serviceKey) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const fixtureId = body.fixtureId;
    if (!fixtureId || typeof fixtureId !== "string") {
      return NextResponse.json({ error: "Missing or invalid fixtureId" }, { status: 400 });
    }

    const resync = await resyncSingleFixture({
      fixtureId,
      supabaseUrl,
      serviceKey,
      footballDataToken: token,
    });

    if (!resync.success) {
      return NextResponse.json(
        { error: resync.error, resync },
        { status: resync.error === "Fixture not found" ? 404 : 400 }
      );
    }

    let predictions_settled = 0;
    if (
      resync.status === "finished" &&
      resync.home_goals != null &&
      resync.away_goals != null
    ) {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data: fixture } = await supabase
        .from("fixtures")
        .select("id, odds_home_current, odds_draw_current, odds_away_current, odds_home, odds_draw, odds_away")
        .eq("id", fixtureId)
        .maybeSingle();

      const { data: predictions } = await supabase
        .from("predictions")
        .select("id, pick, stake, locked_odds, pred_home_goals, pred_away_goals")
        .eq("fixture_id", fixtureId)
        .is("settled_at", null);

      const result = { home_goals: resync.home_goals, away_goals: resync.away_goals };
      const oddsForPick = (pick: string) => {
        if (!fixture) return undefined;
        if (pick === "H") return fixture.odds_home_current ?? fixture.odds_home;
        if (pick === "D") return fixture.odds_draw_current ?? fixture.odds_draw;
        return fixture.odds_away_current ?? fixture.odds_away;
      };

      for (const p of predictions ?? []) {
        const fallbackOdds = oddsForPick(p.pick);
        const scored = scorePrediction(
          {
            pick: p.pick as "H" | "D" | "A",
            stake: Number(p.stake) || 10,
            locked_odds: p.locked_odds != null ? Number(p.locked_odds) : null,
            pred_home_goals: p.pred_home_goals,
            pred_away_goals: p.pred_away_goals,
          },
          result,
          { fallbackOdds: fallbackOdds != null && Number(fallbackOdds) > 0 ? Number(fallbackOdds) : undefined }
        );
        const { error } = await supabase
          .from("predictions")
          .update({
            points_awarded: scored.points_awarded,
            bonus_exact_score_points: scored.bonus_exact_score_points,
            bonus_points: scored.bonus_points,
            settled_at: new Date().toISOString(),
          })
          .eq("id", p.id);
        if (!error) predictions_settled++;
      }
    }

    return NextResponse.json({
      success: true,
      resync: {
        updated: resync.updated,
        status: resync.status,
        home_goals: resync.home_goals,
        away_goals: resync.away_goals,
        replaced_provider_id: resync.replaced_provider_id,
        is_stuck: resync.is_stuck,
      },
      predictions_settled,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
