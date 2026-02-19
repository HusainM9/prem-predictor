import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST: submit or update a prediction. Requires Authorization: Bearer <access_token>.
 * User id is taken from the JWT, not the body, so users cannot submit as someone else.
 */
export async function POST(req: Request) {
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

    const body = await req.json();
    const {
      fixtureId,
      pick,
      predHomeGoals,
      predAwayGoals,
      leagueId = null,
    } = body;

    if (!fixtureId) {
      return NextResponse.json({ error: "Missing fixtureId" }, { status: 400 });
    }

    const hasScore = predHomeGoals !== null && predHomeGoals !== undefined && predAwayGoals !== null && predAwayGoals !== undefined;
    if (!hasScore) {
      return NextResponse.json({ error: "predHomeGoals and predAwayGoals are required" }, { status: 400 });
    }

    const isLeague = leagueId != null && String(leagueId).trim() !== "";
    if (isLeague) {
      const { data: member } = await supabase
        .from("league_members")
        .select("user_id")
        .eq("league_id", leagueId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!member) {
        return NextResponse.json({ error: "Not a member of this league" }, { status: 403 });
      }
    }

    // Derive pick from score when not provided
    const derivedPick =
      predHomeGoals > predAwayGoals ? "H" : predAwayGoals > predHomeGoals ? "A" : "D";
    const pickToUse = pick && (pick === "H" || pick === "D" || pick === "A") ? pick : derivedPick;

    // Load fixture for kickoff and odds (lock odds at prediction time)
    const { data: fixture, error: fxErr } = await supabase
      .from("fixtures")
      .select("id, kickoff_time, status, odds_home, odds_draw, odds_away, odds_home_current, odds_draw_current, odds_away_current")
      .eq("id", fixtureId)
      .maybeSingle();

    if (fxErr || !fixture) return NextResponse.json({ error: "Fixture not found" }, { status: 404 });

    const kickoff = new Date(fixture.kickoff_time).getTime();
    if (Date.now() >= kickoff) {
      return NextResponse.json({ error: "Predictions closed (kickoff passed)" }, { status: 400 });
    }

    if (predHomeGoals < 0 || predAwayGoals < 0) {
      return NextResponse.json({ error: "Invalid score" }, { status: 400 });
    }
    if (pickToUse !== derivedPick) {
      return NextResponse.json({ error: "Score must match result (home win / draw / away win)" }, { status: 400 });
    }

    const raw =
      pickToUse === "H"
        ? fixture.odds_home ?? fixture.odds_home_current
        : pickToUse === "D"
          ? fixture.odds_draw ?? fixture.odds_draw_current
          : fixture.odds_away ?? fixture.odds_away_current;
    const locked_odds = raw != null && Number(raw) > 0 ? Number(raw) : null;

    const userId = user.id;
    const row = {
      user_id: userId,
      fixture_id: fixtureId,
      league_id: isLeague ? leagueId : null,
      pick: pickToUse,
      stake: 10,
      locked_odds,
      pred_home_goals: predHomeGoals,
      pred_away_goals: predAwayGoals,
      submitted_at: new Date().toISOString(),
    };

    const { error: insErr } = await supabase
      .from("predictions")
      .upsert(row, { onConflict: "league_id,fixture_id,user_id" });

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Route crashed", message: String(err?.message ?? err) }, { status: 500 });
  }
}
