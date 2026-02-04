import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function pickBookmaker(bookmakers: any[], preferred?: string) {
  if (!Array.isArray(bookmakers) || bookmakers.length === 0) return null;
  if (preferred) {
    const found = bookmakers.find(
      (b) => String(b?.title).toLowerCase() === preferred.toLowerCase()
    );
    if (found) return found;
  }
  return bookmakers[0];
}

export async function GET() {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    const region = process.env.ODDS_API_REGION || "uk";
    const preferredBook = process.env.ODDS_API_BOOKMAKER; // optional (e.g. "Sky Bet")
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    if (!apiKey) return NextResponse.json({ error: "Missing ODDS_API_KEY" }, { status: 500 });
    if (!serviceKey) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fixtures in the 24h lock window
    const now = new Date("2026-02-05T20:00:00Z");
    const from = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const to = new Date(from.getTime() + 30 * 60 * 1000);

    const { data: fixtures, error } = await supabase
      .from("fixtures")
      .select("id,odds_api_event_id,home_team,away_team,kickoff_time,odds_locked_at")
      .gte("kickoff_time", from.toISOString())
      .lte("kickoff_time", to.toISOString())
      .is("odds_locked_at", null)
      .not("odds_api_event_id", "is", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!fixtures || fixtures.length === 0) {
      return NextResponse.json({
        success: true,
        fixtures_considered: 0,
        odds_locked: 0,
        note: "No fixtures in the 24h window. For testing, temporarily set 'now' to 24h before a known kickoff.",
      });
    }

    // Fetch all current EPL odds once
    const url =
      `https://api.the-odds-api.com/v4/sports/soccer_epl/odds` +
      `?regions=${region}&markets=h2h&oddsFormat=decimal&apiKey=${apiKey}`;

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json({ error: "Odds API request failed", status: res.status, body: text }, { status: 500 });
    }

    const events = JSON.parse(text) as any[];

    let locked = 0;

    for (const f of fixtures) {
      const event = events.find((e: any) => e.id === f.odds_api_event_id);
      if (!event) continue;

      const bookmaker = pickBookmaker(event.bookmakers, preferredBook);
      if (!bookmaker) continue;

      const h2h = bookmaker.markets?.find((m: any) => m.key === "h2h");
      const outcomes = h2h?.outcomes ?? [];

      // Outcomes are: {name, price} for Home, Away, Draw
      const homePrice = outcomes.find((o: any) => o.name === event.home_team)?.price;
      const awayPrice = outcomes.find((o: any) => o.name === event.away_team)?.price;
      const drawPrice = outcomes.find((o: any) => String(o.name).toLowerCase() === "draw")?.price;

      if (!homePrice || !awayPrice || !drawPrice) continue;

      const { error: updErr } = await supabase
        .from("fixtures")
        .update({
          odds_home: Number(homePrice),
          odds_draw: Number(drawPrice),
          odds_away: Number(awayPrice),
          odds_bookmaker: bookmaker.title ?? null,
          odds_locked_at: new Date().toISOString(),
        })
        .eq("id", f.id);

      if (!updErr) locked++;
    }

    return NextResponse.json({
      success: true,
      fixtures_considered: fixtures.length,
      odds_locked: locked,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Route crashed", message: String(err?.message ?? err) }, { status: 500 });
  }
}
