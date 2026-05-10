import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";

const UNLOCK_FIELDS = {
  odds_locked_at: null as null,
  odds_home: null as null,
  odds_draw: null as null,
  odds_away: null as null,
  odds_bookmaker: null as null,
};

/**
 * Revert an early lock: clear fixture lock timestamp + locked line, and prediction locked_odds.
 *
 * POST /api/admin/unlock-odds?fixtureId=<uuid>
 * POST /api/admin/unlock-odds?scope=upcoming  — all fixtures with kickoff in the future and odds_locked_at set
 * POST /api/admin/unlock-odds?season=2025%2F26&gameweek=33
 */
export async function POST(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!serviceKey) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const url = new URL(req.url);
  const fixtureId = url.searchParams.get("fixtureId")?.trim() || null;
  const scope = url.searchParams.get("scope")?.trim() || null;
  const season = url.searchParams.get("season")?.trim() || null;
  const gameweekRaw = url.searchParams.get("gameweek")?.trim();
  const gameweek =
    gameweekRaw != null && gameweekRaw !== "" ? Number(gameweekRaw) : null;

  const supabase = createClient(supabaseUrl, serviceKey);

  let fixtureIds: string[] = [];
  let selection: string;

  if (fixtureId) {
    const { data: row, error } = await supabase
      .from("fixtures")
      .select("id")
      .eq("id", fixtureId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
    fixtureIds = [fixtureId];
    selection = "fixtureId";
  } else if (season && gameweek != null && Number.isInteger(gameweek)) {
    const { data, error } = await supabase
      .from("fixtures")
      .select("id")
      .eq("season", season)
      .eq("gameweek", gameweek)
      .not("odds_locked_at", "is", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    fixtureIds = (data ?? []).map((r: { id: string }) => r.id).filter(Boolean);
    selection = "season_gameweek";
  } else if (scope === "upcoming") {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("fixtures")
      .select("id")
      .gt("kickoff_time", nowIso)
      .not("odds_locked_at", "is", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    fixtureIds = (data ?? []).map((r: { id: string }) => r.id).filter(Boolean);
    selection = "upcoming";
  } else {
    return NextResponse.json(
      {
        error:
          "Specify fixtureId=<uuid>, or scope=upcoming, or season=<e.g.2025/26>&gameweek=<n>",
      },
      { status: 400 }
    );
  }

  if (fixtureIds.length === 0) {
    return NextResponse.json({
      success: true,
      selection,
      fixtures_unlocked: 0,
      note: "No matching fixtures had odds_locked_at set.",
    });
  }

  const { error: fxErr } = await supabase.from("fixtures").update(UNLOCK_FIELDS).in("id", fixtureIds);
  if (fxErr) return NextResponse.json({ error: fxErr.message }, { status: 500 });

  const { error: predErr } = await supabase
    .from("predictions")
    .update({ locked_odds: null })
    .in("fixture_id", fixtureIds);

  if (predErr) {
    return NextResponse.json(
      {
        error: predErr.message,
        fixtures_unlocked: fixtureIds.length,
        warning: "Fixtures unlocked but predictions.locked_odds clear failed.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    selection,
    fixture_ids: fixtureIds,
    fixtures_unlocked: fixtureIds.length,
    note: "Predictions for these fixtures had locked_odds cleared. Run Fetch current odds if needed; lock again when ready.",
  });
}
