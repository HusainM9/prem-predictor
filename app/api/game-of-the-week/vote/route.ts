import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
      .select("id, gameweek, kickoff_time")
      .eq("id", fixtureId)
      .maybeSingle();
    if (fixErr || !fixture) {
      return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
    }
    if (fixture.gameweek !== gameweek) {
      return NextResponse.json({ error: "Fixture is not in that gameweek" }, { status: 400 });
    }

    const { data: fixturesInGw } = await supabase
      .from("fixtures")
      .select("kickoff_time")
      .eq("season", season)
      .eq("gameweek", gameweek)
      .order("kickoff_time", { ascending: true });
    const firstKickoff = (fixturesInGw ?? [])[0]?.kickoff_time;
    if (!firstKickoff) {
      return NextResponse.json({ error: "No fixtures found for that gameweek" }, { status: 400 });
    }
    const kickoffMs = new Date(firstKickoff).getTime();
    const closingMs = kickoffMs - 24 * 60 * 60 * 1000;
    if (Date.now() >= closingMs) {
      return NextResponse.json(
        { error: "Voting has closed. It ends 24 hours before the first kickoff of the gameweek." },
        { status: 400 }
      );
    }

    const { error: upsertErr } = await supabase
      .from("game_of_the_week_votes")
      .upsert(
        {
          user_id: user.id,
          season,
          gameweek,
          fixture_id: fixtureId,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id,season,gameweek" }
      );
    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
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
