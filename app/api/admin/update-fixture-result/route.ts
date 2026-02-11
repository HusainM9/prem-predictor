import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";

/**
 * POST body: { fixtureId, homeGoals, awayGoals }
 * Updates only the fixture's score. Does NOT set status to finished or run
 * prediction scoring. Use for live score updates so /matches shows the score;
 * use settle-fixtures when the match is over.
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
      return NextResponse.json(
        { error: "homeGoals and awayGoals must be non-negative integers" },
        { status: 400 }
      );
    }
    const { error } = await supabase
      .from("fixtures")
      .update({ home_goals: h, away_goals: a })
      .eq("id", fixtureId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, fixtureId, home_goals: h, away_goals: a });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
