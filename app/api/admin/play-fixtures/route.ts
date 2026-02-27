import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";

/**
 * List fixtures included on the Play page.
 */
export async function GET(req: Request) {
  const err = requireAdmin(req);
  if (err) return err;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Missing service key" }, { status: 500 });

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, home_team, away_team, gameweek, kickoff_time, status")
    .eq("include_on_play_page", true)
    .order("kickoff_time", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fixtures: data ?? [] });
}

export async function POST(req: Request) {
  const err = requireAdmin(req);
  if (err) return err;

  const body = await req.json().catch(() => ({}));
  const fixtureId = typeof body.fixtureId === "string" ? body.fixtureId.trim() : "";
  const remove = body.remove === true;
  if (!fixtureId) return NextResponse.json({ error: "fixtureId is required" }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Missing service key" }, { status: 500 });

  const supabase = createClient(supabaseUrl, serviceKey);

  if (remove) {
    const { error: updateErr } = await supabase
      .from("fixtures")
      .update({ include_on_play_page: false })
      .eq("id", fixtureId);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const { data: fixture, error: fetchErr } = await supabase
    .from("fixtures")
    .select("id, home_team, away_team, gameweek")
    .eq("id", fixtureId)
    .maybeSingle();

  if (fetchErr || !fixture) {
    return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from("fixtures")
    .update({ include_on_play_page: true })
    .eq("id", fixtureId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({
    success: true,
    message: `Added "${fixture.home_team} vs ${fixture.away_team}" (GW ${fixture.gameweek}) to Play page`,
  });
}
