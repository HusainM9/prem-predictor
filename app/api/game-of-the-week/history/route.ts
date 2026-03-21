import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildGotwHistory, type GotwHistoryFixture, type GotwHistoryVote } from "@/lib/game-of-the-week-history";

const DEFAULT_SEASON = "2025/26";

/**
 * Season-wide Game of the Week history: winners per gameweek (after voting closes) and the current user's vote.
 */
export async function GET(req: Request) {
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
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const season = (searchParams.get("season") ?? DEFAULT_SEASON) as string;

    const [{ data: fxRows, error: fxErr }, { data: voteRows, error: voteErr }] = await Promise.all([
      supabase
        .from("fixtures")
        .select("id, gameweek, kickoff_time, status, home_team, away_team")
        .eq("season", season),
      supabase
        .from("game_of_the_week_votes")
        .select("gameweek, fixture_id, created_at, user_id")
        .eq("season", season),
    ]);

    if (fxErr) {
      return NextResponse.json({ error: fxErr.message }, { status: 500 });
    }
    if (voteErr) {
      return NextResponse.json({ error: voteErr.message }, { status: 500 });
    }

    const fixtures = (fxRows ?? []) as GotwHistoryFixture[];
    const votes = (voteRows ?? []) as GotwHistoryVote[];

    const entries = buildGotwHistory(fixtures, votes, user.id);

    return NextResponse.json({ season, entries });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 500 }
    );
  }
}
