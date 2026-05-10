import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";

const ALLOWED_STATUS = new Set(["scheduled", "in_play", "finished", "postponed"]);

/**
 * Admin override for fixture scheduling fields.
 * Useful for postponements/reschedules before provider data catches up.
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
    const fixtureId = typeof body.fixtureId === "string" ? body.fixtureId.trim() : "";
    if (!fixtureId) {
      return NextResponse.json({ error: "fixtureId is required" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    if (body.status != null) {
      const nextStatus = String(body.status).toLowerCase().trim();
      if (!ALLOWED_STATUS.has(nextStatus)) {
        return NextResponse.json(
          { error: "status must be one of: scheduled, in_play, finished, postponed" },
          { status: 400 }
        );
      }
      update.status = nextStatus;
      if (nextStatus === "postponed") {
        update.include_on_play_page = false;
      }
    }

    if (body.gameweek != null && body.gameweek !== "") {
      const gameweek = Number(body.gameweek);
      if (!Number.isInteger(gameweek) || gameweek < 1) {
        return NextResponse.json({ error: "gameweek must be an integer >= 1" }, { status: 400 });
      }
      update.gameweek = gameweek;
    }

    if (body.kickoff_time != null && body.kickoff_time !== "") {
      const kickoff = new Date(String(body.kickoff_time));
      if (Number.isNaN(kickoff.getTime())) {
        return NextResponse.json({ error: "kickoff_time must be a valid ISO datetime" }, { status: 400 });
      }
      update.kickoff_time = kickoff.toISOString();
    }

    if (body.include_on_play_page != null) {
      update.include_on_play_page = body.include_on_play_page === true;
    }

    if (body.clear_scores === true) {
      update.home_goals = null;
      update.away_goals = null;
      update.is_stuck = false;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "Provide at least one field: status, gameweek, kickoff_time, include_on_play_page, clear_scores" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("fixtures")
      .update(update)
      .eq("id", fixtureId)
      .select("id, gameweek, kickoff_time, status, include_on_play_page, home_goals, away_goals")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Fixture not found" }, { status: 404 });

    return NextResponse.json({ success: true, fixture: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
