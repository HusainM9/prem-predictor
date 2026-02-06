// app/api/odds/fetch-current/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1) Load fixtures needing odds (must have odds_api_event_id from map-odds)
    const { data: fixtures, error } = await supabase
      .from("fixtures")
      .select("id, odds_api_event_id, home_team, away_team, kickoff_time")
      .gt("kickoff_time", new Date().toISOString())
      .lte("kickoff_time", new Date(Date.now() + 3 * 86400000).toISOString())
      .is("odds_locked_at", null)
      .not("odds_api_event_id", "is", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!fixtures || fixtures.length === 0) {
      return NextResponse.json({
        success: true,
        fixtures_checked: 0,
        fixtures_updated: 0,
      });
    }

    // 2) Fetch ALL odds ONCE
    const oddsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/soccer_epl/odds?regions=uk&markets=h2h&oddsFormat=decimal&apiKey=${process.env.ODDS_API_KEY}`,
      { cache: "no-store" }
    );

    if (!oddsRes.ok) {
      throw new Error("Odds API request failed");
    }

    const events = (await oddsRes.json()) as any[];

    let updated = 0;

    for (const fixture of fixtures) {
      // Match by unique event ID so each fixture gets its own odds (no duplication)
      const event = events.find((e: any) => e.id === fixture.odds_api_event_id);
      if (!event) continue;

      const bookmaker = event.bookmakers?.[0];
      if (!bookmaker) continue;

      const h2h = bookmaker.markets?.find((m: any) => m.key === "h2h");
      if (!h2h) continue;

      // Outcomes use event's home_team / away_team names, not DB names
      const h = h2h.outcomes.find((o: any) => o.name === event.home_team);
      const d = h2h.outcomes.find((o: any) => String(o.name).toLowerCase() === "draw");
      const a = h2h.outcomes.find((o: any) => o.name === event.away_team);

      if (!h || !d || !a) continue;

      await supabase
        .from("fixtures")
        .update({
          odds_home_current: Number(h.price),
          odds_draw_current: Number(d.price),
          odds_away_current: Number(a.price),
          odds_current_bookmaker: bookmaker.title ?? bookmaker.key ?? null,
          odds_current_updated_at: new Date().toISOString(),
        })
        .eq("id", fixture.id);

      updated++;
    }

    return NextResponse.json({
      success: true,
      fixtures_checked: fixtures.length,
      fixtures_updated: updated,
    });
  } catch (err: any) {
    console.error("fetch-current odds error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
