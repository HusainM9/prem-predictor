import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sameishTeam(dbName: string, apiName: string) {
  const a = norm(dbName);
  const b = norm(apiName);
  // “contains” match is good enough for MVP mapping
  return a.includes(b) || b.includes(a);
}

export async function GET() {
  try {
    const apiKey = process.env.API_SPORTS_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!apiKey) return NextResponse.json({ error: "Missing API_SPORTS_KEY" }, { status: 500 });
    if (!serviceKey) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

    const supabase = createClient(supabaseUrl, serviceKey);

    // 1) Get DB fixtures (next 14 days) that haven't been mapped yet
    const now = new Date();
    const from = now.toISOString().slice(0, 10);
    const to = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: dbFixtures, error: dbErr } = await supabase
      .from("fixtures")
      .select("id,kickoff_time,home_team,away_team,api_sports_fixture_id")
      .gte("kickoff_time", `${from}T00:00:00Z`)
      .lte("kickoff_time", `${to}T23:59:59Z`)
      .is("api_sports_fixture_id", null);

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

    // 2) Fetch API-FOOTBALL fixtures for EPL in that date window
    // EPL league id is commonly 39; season is start year for 2025/26 -> 2025
    // You can change if needed.
    const league = 39;
    const season = 2025;

    const url = `https://v3.football.api-sports.io/fixtures?league=${league}&season=${season}&from=${from}&to=${to}`;

    const apiRes = await fetch(url, {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
    });

    const apiText = await apiRes.text();
    if (!apiRes.ok) {
      return NextResponse.json({ error: "API-SPORTS fixtures request failed", status: apiRes.status, body: apiText }, { status: 500 });
    }

    const apiJson = JSON.parse(apiText);
    const apiFixtures = apiJson.response ?? [];

    // 3) Try to match each DB fixture to an API fixture by time + teams
    let updated = 0;
    const updates: { id: string; api_sports_fixture_id: number }[] = [];

    for (const f of dbFixtures ?? []) {
      const dbKick = new Date(f.kickoff_time).getTime();

      // Find API fixture within +/- 2 hours and team names “similar”
      const match = apiFixtures.find((af: any) => {
        const apiKick = new Date(af.fixture?.date).getTime();
        const within2h = Math.abs(apiKick - dbKick) <= 2 * 60 * 60 * 1000;

        const apiHome = af.teams?.home?.name ?? "";
        const apiAway = af.teams?.away?.name ?? "";

        return (
          within2h &&
          sameishTeam(f.home_team, apiHome) &&
          sameishTeam(f.away_team, apiAway)
        );
      });

      if (match?.fixture?.id) {
        updates.push({ id: f.id, api_sports_fixture_id: match.fixture.id });
      }
    }

    // 4) Write mappings back to DB
    for (const u of updates) {
      const { error } = await supabase.from("fixtures").update({ api_sports_fixture_id: u.api_sports_fixture_id }).eq("id", u.id);
      if (!error) updated++;
    }

    return NextResponse.json({
      success: true,
      db_fixtures_checked: (dbFixtures ?? []).length,
      api_fixtures_fetched: apiFixtures.length,
      mapped_and_saved: updated,
      from,
      to,
      note: "If mapped_and_saved is 0, season/league may be wrong or team names differ. We'll fix by inspecting one fixture.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Route crashed", message: String(err?.message ?? err) }, { status: 500 });
  }
}

