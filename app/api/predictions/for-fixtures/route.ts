import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/predictions/for-fixtures?fixtureIds=uuid1,uuid2,...&leagueId=uuid (optional)
 * Returns the current user's predictions for the given fixture IDs (for pre-filling the play page).
 * - leagueId omitted or empty: global predictions (league_id is null).
 * - leagueId set: predictions for that league only.
 * Requires Authorization: Bearer <access_token>.
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

    const { searchParams } = new URL(req.url);
    const fixtureIdsParam = searchParams.get("fixtureIds");
    const leagueIdParam = searchParams.get("leagueId");
    const leagueId = leagueIdParam != null && String(leagueIdParam).trim() !== "" ? leagueIdParam.trim() : null;

    if (!fixtureIdsParam || fixtureIdsParam.trim() === "") {
      return NextResponse.json({ predictions: [] });
    }
    const fixtureIds = fixtureIdsParam.split(",").map((id) => id.trim()).filter(Boolean);
    if (fixtureIds.length === 0) {
      return NextResponse.json({ predictions: [] });
    }

    // --- Use service role so we can read this user's predictions for any league ---
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // --- Fetch predictions for this user and these fixtures; filter by league (global = null) ---
    let query = supabase
      .from("predictions")
      .select("fixture_id, pred_home_goals, pred_away_goals")
      .eq("user_id", user.id)
      .in("fixture_id", fixtureIds);

    if (leagueId != null) {
      query = query.eq("league_id", leagueId);
    } else {
      query = query.is("league_id", null);
    }

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // --- Return a simple list for the play page to pre-fill inputs ---
    const predictions = (rows ?? []).map((p) => ({
      fixture_id: p.fixture_id,
      pred_home_goals: p.pred_home_goals,
      pred_away_goals: p.pred_away_goals,
    }));

    return NextResponse.json({ predictions });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
