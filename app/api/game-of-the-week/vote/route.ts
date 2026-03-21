import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getGotwAnchorKickoffMs } from "@/lib/gotw-close";

const DEFAULT_SEASON = "2025/26";

/**
 * Cast or update vote for game of the week. Voting closes before the first kickoff of the gameweek.
 */
export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const fixtureId = body.fixture_id;
    const gameweek = body.gameweek != null ? Number(body.gameweek) : null;
    const season = (body.season ?? DEFAULT_SEASON) as string;

    if (!fixtureId || typeof fixtureId !== "string" || gameweek == null || !Number.isInteger(gameweek) || gameweek < 1) {
      return NextResponse.json(
        { error: "Missing or invalid fixture_id or gameweek" },
        { status: 400 }
      );
    }

    const { data: fixture, error: fixErr } = await supabase
      .from("fixtures")
      .select("id, season, gameweek, kickoff_time, status")
      .eq("id", fixtureId)
      .maybeSingle();
    if (fixErr || !fixture) {
      return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
    }
    if (fixture.gameweek !== gameweek || fixture.season !== season) {
      return NextResponse.json({ error: "Fixture is not in that gameweek" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    // Closing time is 24h before the GW's first non-postponed kickoff (same as tally / GET).
    const { data: gwOrdered } = await supabase
      .from("fixtures")
      .select("id, kickoff_time, status")
      .eq("season", season)
      .eq("gameweek", gameweek)
      .neq("status", "postponed")
      .order("kickoff_time", { ascending: true });
    const kickoffs = (gwOrdered ?? []).map((f: { kickoff_time: string }) => f.kickoff_time);
    const anchorMs = getGotwAnchorKickoffMs(kickoffs);
    if (anchorMs == null) {
      return NextResponse.json({ error: "No fixtures found for that gameweek" }, { status: 400 });
    }
    const closingMs = anchorMs - 24 * 60 * 60 * 1000;
    if (Date.now() >= closingMs) {
      return NextResponse.json(
        { error: "Voting has closed. It ends 24 hours before the first kickoff of the gameweek." },
        { status: 400 }
      );
    }
    const allowedFixtureIds = new Set(
      (gwOrdered ?? [])
        .filter((f: { status: string; kickoff_time: string }) => f.status === "scheduled" && f.kickoff_time >= nowIso)
        .map((f: { id: string }) => f.id)
    );
    if (!allowedFixtureIds.has(fixtureId)) {
      return NextResponse.json({ error: "Fixture is not open for voting" }, { status: 400 });
    }
    // Preserve first `created_at` when the user changes pick. Tally uses created_at < close time;
    // resetting it on every upsert made later edits look "after" the deadline and dropped all votes.
    const { data: existing, error: existingErr } = await supabase
      .from("game_of_the_week_votes")
      .select("id")
      .eq("user_id", user.id)
      .eq("season", season)
      .eq("gameweek", gameweek)
      .maybeSingle();
    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }

    if (existing?.id) {
      const { error: updErr } = await supabase
        .from("game_of_the_week_votes")
        .update({ fixture_id: fixtureId })
        .eq("id", existing.id);
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
    } else {
      const { error: insErr } = await supabase.from("game_of_the_week_votes").insert({
        user_id: user.id,
        season,
        gameweek,
        fixture_id: fixtureId,
        created_at: new Date().toISOString(),
      });
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      fixture_id: fixtureId,
      gameweek,
      season,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 500 }
    );
  }
}
