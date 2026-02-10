import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PREFERRED_BOOKMAKERS = ["bet365", "skybet"];

function pickPreferredBookmaker(bookmakers: any[]) {
  if (!Array.isArray(bookmakers) || bookmakers.length === 0) return null;

  for (const pref of PREFERRED_BOOKMAKERS) {
    const found = bookmakers.find((b: any) => String(b?.key).toLowerCase() === pref);
    if (found) return found;
  }
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

export async function GET(req: Request) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    const region = process.env.ODDS_API_REGION || "uk";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    if (!apiKey) return NextResponse.json({ error: "Missing ODDS_API_KEY" }, { status: 500 });
    if (!serviceKey) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

    const supabase = createClient(supabaseUrl, serviceKey);

    // Optional dev testing: ?now=2026-02-05T20:00:00Z
    const { searchParams } = new URL(req.url);
    const nowParam = searchParams.get("now");
    const now = nowParam ? new Date(nowParam) : new Date();

    // Lock odds for any fixture that kicks off in the next 24 hours (so we're "within 24h of kickoff")
    const lockFrom = new Date(now.getTime() + 60 * 1000); // 1 min from now to avoid races
    const lockTo = new Date(now.getTime() + 24 * 60 * 60 * 1000); // up to 24h from now

    const { data: fixtures, error } = await supabase
      .from("fixtures")
      .select(
        "id,odds_api_event_id,home_team,away_team,kickoff_time,odds_locked_at,odds_home_current,odds_draw_current,odds_away_current"
      )
      .gte("kickoff_time", lockFrom.toISOString())
      .lte("kickoff_time", lockTo.toISOString())
      .is("odds_locked_at", null)
      .not("odds_api_event_id", "is", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!fixtures || fixtures.length === 0) {
      return NextResponse.json({
        success: true,
        fixtures_considered: 0,
        odds_locked: 0,
        predictions_snapshotted: 0,
        note: "No fixtures kicking off in the next 24h.",
        window: { lockFrom: lockFrom.toISOString(), lockTo: lockTo.toISOString() },
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
    let snap = 0;

    for (const f of fixtures) {
      const event = events.find((e: any) => e.id === f.odds_api_event_id);

      // Prefer locking from the live event odds (best), else fallback to current odds if present
      let oddsToLock: { home: number; draw: number; away: number } | null = null;
      let bookTitle: string | null = null;

      if (event) {
        const bookmaker = pickPreferredBookmaker(event.bookmakers);
        if (bookmaker) {
          const odds = getH2HOdds(event, bookmaker);
          if (odds) {
            oddsToLock = odds;
            bookTitle = bookmaker.title ?? bookmaker.key ?? null;
          }
        }
      }

      // Fallback: use stored current odds if Odds API event missing
      if (!oddsToLock && f.odds_home_current != null && f.odds_draw_current != null && f.odds_away_current != null) {
        oddsToLock = {
          home: Number(f.odds_home_current),
          draw: Number(f.odds_draw_current),
          away: Number(f.odds_away_current),
        };
        bookTitle = null;
      }

      if (!oddsToLock) continue;

      // 1) Lock odds on fixture
      const { error: updErr } = await supabase
        .from("fixtures")
        .update({
          odds_home: oddsToLock.home,
          odds_draw: oddsToLock.draw,
          odds_away: oddsToLock.away,
          odds_bookmaker: bookTitle,
          odds_locked_at: new Date().toISOString(),
        })
        .eq("id", f.id);

      if (updErr) continue;
      locked++;

      // 2) Snapshot locked odds onto predictions for this fixture (only if not already set)
      const { data: preds, error: predErr } = await supabase
        .from("predictions")
        .select("id,pick,locked_odds")
        .eq("fixture_id", f.id);

      if (predErr || !preds) continue;

      for (const p of preds) {
        if (p.locked_odds != null) continue;

        const lo =
          p.pick === "H" ? oddsToLock.home :
          p.pick === "D" ? oddsToLock.draw :
          oddsToLock.away;

        const { error: pUpdErr } = await supabase
          .from("predictions")
          .update({ locked_odds: lo })
          .eq("id", p.id);

        if (!pUpdErr) snap++;
      }
    }

    return NextResponse.json({
      success: true,
      fixtures_considered: fixtures.length,
      odds_locked: locked,
      predictions_snapshotted: snap,
      bookmaker_preference: ["bet365", "skybet"],
      window: { lockFrom: lockFrom.toISOString(), lockTo: lockTo.toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Route crashed", message: String(err?.message ?? err) }, { status: 500 });
  }
}
