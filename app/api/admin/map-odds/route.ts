import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";

// --- Normalise team names for matching (lowercase, strip FC/AFC, collapse punctuation) ---
function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\bfc\b/g, "")
    .replace(/\bafc\b/g, "")
    .replace(/\butd\b/g, "united")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// --- Map common variants to a canonical name so "Man City" matches "Manchester City" ---
const ALIASES: Record<string, string> = {
  wolves: "wolverhampton wanderers",
  wolverhampton: "wolverhampton wanderers",
  spurs: "tottenham hotspur",
  "man city": "manchester city",
  "man utd": "manchester united",
  "man united": "manchester united",
  "notts forest": "nottingham forest",
  "nottm forest": "nottingham forest",
  forest: "nottingham forest",
  newcastle: "newcastle united",
  // add more if you notice misses later
};

function canonical(team: string) {
  const n = norm(team);
  for (const key of Object.keys(ALIASES)) {
    if (n.includes(key)) return ALIASES[key];
  }
  return n;
}

function teamsMatch(dbHome: string, dbAway: string, apiHome: string, apiAway: string) {
  const dh = canonical(dbHome);
  const da = canonical(dbAway);
  const ah = canonical(apiHome);
  const aa = canonical(apiAway);

  const dht = new Set(dh.split(" ").filter(Boolean));
  const dat = new Set(da.split(" ").filter(Boolean));
  const aht = new Set(ah.split(" ").filter(Boolean));
  const aat = new Set(aa.split(" ").filter(Boolean));

  const overlap = (A: Set<string>, B: Set<string>) =>
    [...A].filter((x) => B.has(x)).length;

  // require at least 1 token overlap for home AND away
  return overlap(dht, aht) >= 1 && overlap(dat, aat) >= 1;
}

export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const apiKey = process.env.ODDS_API_KEY;
    const region = process.env.ODDS_API_REGION || "uk";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    if (!apiKey) return NextResponse.json({ error: "Missing ODDS_API_KEY" }, { status: 500 });
    if (!serviceKey) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch Odds API EPL events first 
    const oddsUrl =
      `https://api.the-odds-api.com/v4/sports/soccer_epl/odds` +
      `?regions=${region}&markets=h2h&oddsFormat=decimal&apiKey=${apiKey}`;

    const oddsRes = await fetch(oddsUrl, { cache: "no-store" });
    const oddsText = await oddsRes.text();

    if (!oddsRes.ok) {
      return NextResponse.json(
        { error: "Odds API request failed", status: oddsRes.status, body: oddsText },
        { status: 500 }
      );
    }

    interface OddsApiEvent {
      id?: string;
      commence_time?: string;
      home_team?: string;
      away_team?: string;
    }
    const events = JSON.parse(oddsText) as OddsApiEvent[];

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ success: true, mapped_and_saved: 0, note: "No odds events returned." });
    }

    // Compute window as full calendar days covering all events 
    const times = events
      .map((e) => new Date(e.commence_time ?? "").getTime())
      .filter((t) => Number.isFinite(t));

    const minT = Math.min(...times);
    const maxT = Math.max(...times);

    const minDate = new Date(minT);
    const maxDate = new Date(maxT);
    const fromIso = new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), minDate.getUTCDate(), 0, 0, 0, 0)).toISOString();
    const toIso = new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), maxDate.getUTCDate(), 23, 59, 59, 999)).toISOString();

    // Pull DB fixtures in this window that are not mapped yet
    const { data: dbFixtures, error: dbErr } = await supabase
      .from("fixtures")
      .select("id,kickoff_time,home_team,away_team,odds_api_event_id")
      .gte("kickoff_time", fromIso)
      .lte("kickoff_time", toIso)
      .is("odds_api_event_id", null);

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

    // Diagnostic: how many fixtures in window total (ignoring mapping)?
    const { count: dbInWindow } = await supabase
      .from("fixtures")
      .select("*", { count: "exact", head: true })
      .gte("kickoff_time", fromIso)
      .lte("kickoff_time", toIso);

    let mapped = 0;
    let tried = 0;
    const debugUnmatched: { db: { kickoff: string; home: string; away: string }; reason: string }[] = [];

    // Helper to compute hours diff
    const hoursDiff = (a: number, b: number) => Math.abs(a - b) / (1000 * 60 * 60);

    for (const f of dbFixtures ?? []) {
      tried++;

      const dbKick = new Date(f.kickoff_time).getTime();

      // Match by time (+/- 8h) + teams
      let match = events.find((e) => {
        const apiKick = new Date(e.commence_time ?? 0).getTime();
        const within8h = hoursDiff(apiKick, dbKick) <= 8;

        return within8h && teamsMatch(f.home_team, f.away_team, e.home_team ?? "", e.away_team ?? "");
      });

      // Teams-only (if times differ)
      if (!match) {
        match = events.find((e) =>
          teamsMatch(f.home_team, f.away_team, e.home_team ?? "", e.away_team ?? "")
        );
      }

      if (!match?.id) {
        if (debugUnmatched.length < 5) {
          debugUnmatched.push({
            db: { kickoff: f.kickoff_time, home: f.home_team, away: f.away_team },
            reason: "no_match_found",
          });
        }
        continue;
      }

      // Prevent mapping the same odds event to multiple fixtures
      const { data: existing, error: existErr } = await supabase
        .from("fixtures")
        .select("id")
        .eq("odds_api_event_id", match.id)
        .limit(1);

      if (existErr) continue;
      if (existing && existing.length > 0) continue;

      // Save mapping
      const { error } = await supabase
        .from("fixtures")
        .update({ odds_api_event_id: match.id })
        .eq("id", f.id);

      if (!error) mapped++;
    }

    return NextResponse.json({
      success: true,
      odds_api_events_fetched: events.length,
      db_fixtures_in_window: dbInWindow ?? 0,
      db_fixtures_checked: (dbFixtures ?? []).length,
      tried,
      mapped_and_saved: mapped,
      fromIso,
      toIso,
      debugUnmatched,
      note:
        mapped > 0
          ? "Mapping succeeded. Next: run lock-odds."
          : (dbInWindow ?? 0) === 0
            ? "No DB fixtures in this date window—import fixtures for this range first."
            : (dbFixtures ?? []).length === 0
              ? "All fixtures in window are already mapped (odds_api_event_id is set). Nothing to do."
              : "No team/time match found for unmapped fixtures. Check debugUnmatched.",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Route crashed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
