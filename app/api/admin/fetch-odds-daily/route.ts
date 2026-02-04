import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PREFERRED_BOOKMAKERS = ["bet365", "skybet"]; // keys in The Odds API

function pickPreferredBookmaker(bookmakers: any[]) {
  if (!Array.isArray(bookmakers) || bookmakers.length === 0) return null;

  // The Odds API bookmakers have { key, title, markets }
  for (const pref of PREFERRED_BOOKMAKERS) {
    const found = bookmakers.find((b: any) => String(b?.key).toLowerCase() === pref);
    if (found) return found;
  }
  // fallback
  return bookmakers[0];
}

function getH2HOdds(event: any, bookmaker: any) {
  const h2h = bookmaker?.markets?.find((m: any) => m.key === "h2h");
  const outcomes = h2h?.outcomes ?? [];

  const homePrice = outcomes.find((o: any) => o.name === event.home_team)?.price;
  const awayPrice = outcomes.find((o: any) => o.name === event.away_team)?.price;
  const drawPrice = outcomes.find((o: any) => String(o.name).toLowerCase() === "draw")?.price;

  if (homePrice == null || awayPrice == null || drawPrice == null) return null;

  return {
    home: Number(homePrice),
    draw: Number(drawPrice),
    away: Number(awayPrice),
  };
}

export async function GET() {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    const region = process.env.ODDS_API_REGION || "uk";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    if (!apiKey) return NextResponse.json({ error: "Missing ODDS_API_KEY" }, { status: 500 });
    if (!serviceKey) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const from = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h
    const to = new Date(now.getTime() + 72 * 60 * 60 * 1000);   // +72h

    // Only update if not updated today (simple daily gate)
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const { data: fixtures, error } = await supabase
      .from("fixtures")
      .select("id,odds_api_event_id,kickoff_time,odds_current_updated_at")
      .gte("kickoff_time", from.toISOString())
      .lte("kickoff_time", to.toISOString())
      .not("odds_api_event_id", "is", null)
      .or(`odds_current_updated_at.is.null,odds_current_updated_at.lt.${today.toISOString()}`);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!fixtures || fixtures.length === 0) {
      return NextResponse.json({
        success: true,
        fixtures_considered: 0,
        current_odds_updated: 0,
        note: "No fixtures in the 24h–72h window needing a daily refresh.",
      });
    }

    // Fetch all EPL odds once
    const url =
      `https://api.the-odds-api.com/v4/sports/soccer_epl/odds` +
      `?regions=${region}&markets=h2h&oddsFormat=decimal&apiKey=${apiKey}`;

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: "Odds API request failed", status: res.status, body: text },
        { status: 500 }
      );
    }

    const events = JSON.parse(text) as any[];

    let updated = 0;

    for (const f of fixtures) {
      const event = events.find((e: any) => e.id === f.odds_api_event_id);
      if (!event) continue;

      const bookmaker = pickPreferredBookmaker(event.bookmakers);
      if (!bookmaker) continue;

      const odds = getH2HOdds(event, bookmaker);
      if (!odds) continue;

      const { error: updErr } = await supabase
        .from("fixtures")
        .update({
          odds_home_current: odds.home,
          odds_draw_current: odds.draw,
          odds_away_current: odds.away,
          odds_current_updated_at: now.toISOString(),
          odds_current_bookmaker: bookmaker.title ?? bookmaker.key ?? null,
        })
        .eq("id", f.id);

      if (!updErr) updated++;
    }

    return NextResponse.json({
      success: true,
      fixtures_considered: fixtures.length,
      current_odds_updated: updated,
      window: { from: from.toISOString(), to: to.toISOString() },
      bookmaker_preference: ["bet365", "skybet"],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Route crashed", message: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
