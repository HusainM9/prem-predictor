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
      mode = "global",
      leagueId = null,
    } = body;

    if (!fixtureId) {
      return NextResponse.json({ error: "Missing fixtureId" }, { status: 400 });
    }

    const hasScore = predHomeGoals !== null && predHomeGoals !== undefined && predAwayGoals !== null && predAwayGoals !== undefined;
    if (!hasScore) {
      return NextResponse.json({ error: "predHomeGoals and predAwayGoals are required" }, { status: 400 });
    }

    // Derive pick from score when not provided
    const derivedPick =
      predHomeGoals > predAwayGoals ? "H" : predAwayGoals > predHomeGoals ? "A" : "D";
    const pickToUse = pick && (pick === "H" || pick === "D" || pick === "A") ? pick : derivedPick;

    // Load fixture (only for kickoff check)
    const { data: fixture, error: fxErr } = await supabase
      .from("fixtures")
      .select("id,kickoff_time,status")
      .eq("id", fixtureId)
      .maybeSingle();

    if (fxErr || !fixture) return NextResponse.json({ error: "Fixture not found" }, { status: 404 });

    // Prevent submitting after kickoff
    const kickoff = new Date(fixture.kickoff_time).getTime();
    if (Date.now() >= kickoff) {
      return NextResponse.json({ error: "Predictions closed (kickoff passed)" }, { status: 400 });
    }

    // --- Score must be non-negative; pick must match the score (no inconsistent H/D/A) ---
    if (predHomeGoals < 0 || predAwayGoals < 0) {
      return NextResponse.json({ error: "Invalid score" }, { status: 400 });
    }
    if (pickToUse !== derivedPick) {
      return NextResponse.json({ error: "Score must match result (home win / draw / away win)" }, { status: 400 });
    }
    

    const userId = user.id;

    const { error: insErr } = await supabase
    .from("predictions")
    .upsert(
      {
        user_id: userId,
        fixture_id: fixtureId,
        mode,
        league_id: leagueId,
        pick: pickToUse,
        stake: 10,
        pred_home_goals: predHomeGoals,
        pred_away_goals: predAwayGoals,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "fixture_id,user_id,mode" }
    );

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Route crashed", message: String(err?.message ?? err) }, { status: 500 });
  }
}
