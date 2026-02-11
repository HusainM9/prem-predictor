import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";

const DEFAULT_SEASON = "2025/26";

/**
 * GET ?gameweek=26&season=2025/26
 * Returns fixtures for that gameweek (for admin dropdown).
 */
export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);
    const { searchParams } = new URL(req.url);
    const gameweek = searchParams.get("gameweek");
    const season = searchParams.get("season") ?? DEFAULT_SEASON;
    if (!gameweek || !/^\d+$/.test(gameweek)) {
      return NextResponse.json({ error: "Missing or invalid gameweek" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("fixtures")
      .select("id, kickoff_time, home_team, away_team, status, home_goals, away_goals")
      .eq("season", season)
      .eq("gameweek", Number(gameweek))
      .order("kickoff_time", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ fixtures: data ?? [] });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
