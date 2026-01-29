import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const token = process.env.FOOTBALL_DATA_API_KEY;
    if (!token) {
      return NextResponse.json({ error: "Missing FOOTBALL_DATA_API_KEY" }, { status: 500 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // next 14 days to keep response manageable
    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    const toDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const to = toDate.toISOString().slice(0, 10);

    const url = `https://api.football-data.org/v4/competitions/PL/matches?dateFrom=${from}&dateTo=${to}`;

    const res = await fetch(url, {
      headers: { "X-Auth-Token": token },
      cache: "no-store",
    });

    const bodyText = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: "football-data.org request failed", status: res.status, url, body: bodyText },
        { status: 500 }
      );
    }

    const json = JSON.parse(bodyText);
    const matches = json.matches ?? [];

    const rows = matches.map((m: any) => ({
      external_source: "football-data",
      external_id: String(m.id),
      season: "2025/26",
      gameweek: m.matchday ?? 0,
      kickoff_time: m.utcDate,
      home_team: m.homeTeam?.name ?? "TBD",
      away_team: m.awayTeam?.name ?? "TBD",
      status: (m.status ?? "SCHEDULED").toLowerCase() === "finished" ? "finished" : "scheduled",
      home_goals: m.score?.fullTime?.home ?? null,
      away_goals: m.score?.fullTime?.away ?? null,
    }));

    const { error: upsertError } = await supabase
      .from("fixtures")
      .upsert(rows, { onConflict: "external_source,external_id" });

    if (upsertError) {
      return NextResponse.json(
        { error: "Supabase upsert failed", details: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      fetched: matches.length,
      inserted_or_updated: rows.length,
      dateFrom: from,
      dateTo: to,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Route crashed", message: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
