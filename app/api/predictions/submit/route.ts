import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const {
      userId,
      fixtureId,
      pick,            // 'H' | 'D' | 'A'
      predHomeGoals,   // optional (can be null)
      predAwayGoals,   // optional (can be null)
      mode = "global", // 'global' | 'solo' | 'league'
      leagueId = null,
    } = body;

    if (!userId || !fixtureId || !pick) {
      return NextResponse.json({ error: "Missing userId/fixtureId/pick" }, { status: 400 });
    }

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

    // Validate correct-score consistency ONLY if both provided
    const hasScore = predHomeGoals !== null && predHomeGoals !== undefined && predAwayGoals !== null && predAwayGoals !== undefined;

    if (hasScore) {
      if (predHomeGoals < 0 || predAwayGoals < 0) {
        return NextResponse.json({ error: "Invalid score" }, { status: 400 });
      }
      if (pick === "H" && !(predHomeGoals > predAwayGoals)) {
        return NextResponse.json({ error: "Score must match Home win pick" }, { status: 400 });
      }
      if (pick === "A" && !(predAwayGoals > predHomeGoals)) {
        return NextResponse.json({ error: "Score must match Away win pick" }, { status: 400 });
      }
      if (pick === "D" && !(predHomeGoals === predAwayGoals)) {
        return NextResponse.json({ error: "Score must match Draw pick" }, { status: 400 });
      }
    }

    // Upsert prediction (locked_odds stays null until lock-odds snapshots it)
    const { error: insErr } = await supabase
      .from("predictions")
      .upsert(
        {
          user_id: userId,
          fixture_id: fixtureId,
          mode,
          league_id: leagueId,
          pick,
          stake: 10,
          locked_odds: null,
          pred_home_goals: hasScore ? predHomeGoals : null,
          pred_away_goals: hasScore ? predAwayGoals : null,
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
