import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const token = process.env.FOOTBALL_DATA_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!token) return NextResponse.json({ error: "Missing FOOTBALL_DATA_API_KEY" }, { status: 500 });
    if (!serviceKey) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

    const supabase = createClient(supabaseUrl, serviceKey);

    // Read optional query params
    const { searchParams } = new URL(req.url);
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");

    // Default: next 30 days
    const now = new Date();
    const dateFrom = dateFromParam ?? isoDate(now);
    const dateTo = dateToParam ?? isoDate(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));

    const url = `https://api.football-data.org/v4/competitions/PL/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;

    const res = await fetch(url, {
      headers: { "X-Auth-Token": token },
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: "football-data request failed", status: res.status, body: text }, { status: 500 });
    }

    const json = JSON.parse(text);
    const matches = json.matches ?? [];

    let upserted = 0;

    for (const m of matches) {
      const row = {
        external_source: "football-data",
        external_id: String(m.id),
        season: "2025/26", // keep your season label consistent
        gameweek: m.matchday ?? 0,
        kickoff_time: m.utcDate,
        home_team: m.homeTeam?.name ?? "",
        away_team: m.awayTeam?.name ?? "",
        status: (String(m.status).toUpperCase() === "FINISHED") ? "finished" : "scheduled",
        home_goals: m.score?.fullTime?.home ?? null,
        away_goals: m.score?.fullTime?.away ?? null,
      };

      // Upsert by (external_source, external_id) if you added that constraint
      const { error } = await supabase.from("fixtures").upsert(row, {
        onConflict: "external_source,external_id",
      });

      if (!error) upserted++;
    }

    return NextResponse.json({
      success: true,
      fetched: matches.length,
      inserted_or_updated: upserted,
      dateFrom,
      dateTo,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Route crashed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
