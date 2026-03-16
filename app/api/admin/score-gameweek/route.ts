import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { scorePrediction } from "@/lib/scoring/points";

const DEFAULT_SEASON = "2025/26";
const GAME_OF_THE_WEEK_BONUS = 15;

type FixtureRow = {
  id: string;
  kickoff_time: string;
  home_goals: number | null;
  away_goals: number | null;
  odds_home_current: number | null;
  odds_draw_current: number | null;
  odds_away_current: number | null;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
};

/**
 * Settles all unsettled predictions for finished fixtures in the given gameweek.
 * correct = 10×odds + exact bonus; wrong = -10; game-of-the-week correct +15.
 * 7+ correct - +10, all correct - +50, 4+ exact - +10.
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
    const resetOnly = body.reset === true;

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

    const { data: fixtures, error: fxErr } = await supabase
      .from("fixtures")
      .select("id, kickoff_time, home_goals, away_goals, odds_home_current, odds_draw_current, odds_away_current, odds_home, odds_draw, odds_away")
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

    const fixtureIds = fixtures.map((f: { id: string }) => f.id);
    if (resetOnly) {
      await supabase
        .from("predictions")
        .update({
          points_awarded: null,
          bonus_exact_score_points: null,
          bonus_points: null,
          settled_at: null,
        })
        .in("fixture_id", fixtureIds)
        .is("league_id", null);

      await supabase
        .from("user_gameweek_bonuses")
        .delete()
        .eq("season", season)
        .eq("gameweek", gameweek);

      return NextResponse.json({
        success: true,
        season,
        gameweek,
        fixtures_processed: fixtures.length,
        reset_predictions: true,
        reset_bonuses: true,
      });
    }
    const firstKickoff = fixtures.reduce(
      (min: string, f: { kickoff_time: string }) => (f.kickoff_time < min ? f.kickoff_time : min),
      (fixtures as FixtureRow[])[0].kickoff_time
    );
    const kickoffMs = new Date(firstKickoff).getTime();
    const closingIso = new Date(kickoffMs - 24 * 60 * 60 * 1000).toISOString();

    // Game of the week: fixture with most votes where vote was before voting close 
    let gameOfTheWeekFixtureId: string | null = null;
    const { data: votes } = await supabase
      .from("game_of_the_week_votes")
      .select("fixture_id")
      .eq("season", season)
      .eq("gameweek", gameweek)
      .lt("created_at", closingIso);
    if (votes?.length) {
      const countByFixture = new Map<string, number>();
      for (const v of votes as { fixture_id: string }[]) {
        if (fixtureIds.includes(v.fixture_id)) {
          countByFixture.set(v.fixture_id, (countByFixture.get(v.fixture_id) ?? 0) + 1);
        }
      }
      let maxCount = 0;
      for (const [fid, c] of countByFixture) {
        if (c > maxCount) {
          maxCount = c;
          gameOfTheWeekFixtureId = fid;
        }
      }
    }

    const oddsForPick = (f: FixtureRow, pick: string) => {
      if (pick === "H") return f.odds_home_current ?? f.odds_home ?? undefined;
      if (pick === "D") return f.odds_draw_current ?? f.odds_draw ?? undefined;
      return f.odds_away_current ?? f.odds_away ?? undefined;
    };

    let totalSettled = 0;
    for (const fixture of fixtures as FixtureRow[]) {
      const home_goals = fixture.home_goals ?? 0;
      const away_goals = fixture.away_goals ?? 0;

      const { data: predictions, error: predErr } = await supabase
        .from("predictions")
        .select("id, pick, stake, locked_odds, pred_home_goals, pred_away_goals")
        .eq("fixture_id", fixture.id)
        .is("settled_at", null);

      if (predErr) continue;

      const result = { home_goals, away_goals };
      const isGameOfTheWeek = gameOfTheWeekFixtureId === fixture.id;

      for (const p of predictions ?? []) {
        const fallbackOdds = oddsForPick(fixture, p.pick as string);
        const scored = scorePrediction(
          {
            pick: p.pick as "H" | "D" | "A",
            stake: Number(p.stake) || 10,
            locked_odds: p.locked_odds != null ? Number(p.locked_odds) : null,
            pred_home_goals: p.pred_home_goals,
            pred_away_goals: p.pred_away_goals,
          },
          result,
          {
            fallbackOdds: fallbackOdds != null ? Number(fallbackOdds) : undefined,
            gameOfTheWeekBonus: isGameOfTheWeek ? GAME_OF_THE_WEEK_BONUS : undefined,
          }
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

    // Gameweek bonuses: 7+ correct +10, all correct +50, 4+ exact +10
    const { data: settledRows } = await supabase
      .from("predictions")
      .select("user_id, fixture_id, points_awarded, bonus_exact_score_points")
      .in("fixture_id", fixtureIds)
      .not("settled_at", "is", null);

    const numFixtures = fixtures.length;

    const bonusInserts: { user_id: string; season: string; gameweek: number; bonus_type: string; points: number }[] = [];
    const userCorrect = new Map<string, number>();
    const userExact = new Map<string, number>();

    for (const r of settledRows ?? []) {
      const uid = r.user_id as string;
      userCorrect.set(uid, (userCorrect.get(uid) ?? 0) + ((r.points_awarded ?? 0) > 0 ? 1 : 0));
      userExact.set(uid, (userExact.get(uid) ?? 0) + ((r.bonus_exact_score_points ?? 0) > 0 ? 1 : 0));
    }
    for (const [uid, correctCount] of userCorrect) {
      if (correctCount === numFixtures) {
        bonusInserts.push({ user_id: uid, season, gameweek, bonus_type: "all_correct", points: 50 });
      } else if (correctCount >= 7) {
        bonusInserts.push({ user_id: uid, season, gameweek, bonus_type: "correct_7", points: 10 });
      }
    }
    for (const [uid, exactCount] of userExact) {
      if (exactCount >= 4) {
        bonusInserts.push({ user_id: uid, season, gameweek, bonus_type: "exact_4", points: 10 });
      }
    }

    if (bonusInserts.length > 0) {
      await supabase
        .from("user_gameweek_bonuses")
        .delete()
        .eq("season", season)
        .eq("gameweek", gameweek);
      await supabase.from("user_gameweek_bonuses").insert(bonusInserts);
    }

    return NextResponse.json({
      success: true,
      season,
      gameweek,
      fixtures_processed: fixtures.length,
      predictions_settled: totalSettled,
      game_of_the_week_fixture_id: gameOfTheWeekFixtureId,
      gameweek_bonuses_applied: bonusInserts.length,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Route crashed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
