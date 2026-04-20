import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildPredictionSharePayload } from "@/lib/chat/prediction-share";

async function getClients() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return {
    supabaseAuth: createClient(supabaseUrl, anonKey),
    supabase: createClient(supabaseUrl, serviceKey),
  };
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { supabaseAuth, supabase } = await getClients();
    const {
      data: { user },
      error: authErr,
    } = await supabaseAuth.auth.getUser(token);
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limitRaw = Number(searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : 20;
    const gameweekParam = searchParams.get("gameweek");
    const gameweek =
      gameweekParam != null && gameweekParam !== "" && Number.isInteger(Number(gameweekParam))
        ? Number(gameweekParam)
        : null;

    const { data, error } = await supabase
      .from("predictions")
      .select(
        "id,fixture_id,pred_home_goals,pred_away_goals,pick,submitted_at,points_awarded,bonus_exact_score_points,bonus_points,settled_at,fixtures!inner(home_team,away_team,kickoff_time,gameweek,status,home_goals,away_goals)"
      )
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const predictions = (data ?? [])
      .map((row) => {
        const fixture = Array.isArray(row.fixtures) ? row.fixtures[0] : row.fixtures;
        if (!fixture) return null;
        return {
          id: row.id as string,
          fixture_id: row.fixture_id as string,
          pred_home_goals: Number(row.pred_home_goals),
          pred_away_goals: Number(row.pred_away_goals),
          pick: row.pick as "H" | "D" | "A",
          submitted_at: row.submitted_at as string,
          points_awarded: Number(row.points_awarded ?? 0),
          bonus_points: Number(row.bonus_exact_score_points ?? row.bonus_points ?? 0),
          total_points: Number(row.points_awarded ?? 0) + Number(row.bonus_exact_score_points ?? row.bonus_points ?? 0),
          settled_at: (row.settled_at as string | null) ?? null,
          fixture: {
            home_team: fixture.home_team as string,
            away_team: fixture.away_team as string,
            kickoff_time: fixture.kickoff_time as string,
            gameweek: Number(fixture.gameweek ?? 0),
            status: (fixture.status as string | null) ?? null,
            home_goals: (fixture.home_goals as number | null) ?? null,
            away_goals: (fixture.away_goals as number | null) ?? null,
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const gameweeks = [...new Set(predictions.map((p) => p.fixture.gameweek).filter((gw) => gw > 0))].sort(
      (a, b) => b - a
    );
    const filtered = gameweek != null ? predictions.filter((p) => p.fixture.gameweek === gameweek) : predictions;

    return NextResponse.json({
      gameweeks,
      predictions: filtered.map((prediction) => buildPredictionSharePayload(prediction)),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

