import { createClient } from "@supabase/supabase-js";

const DEFAULT_SEASON = "2025/26";

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/\bfc\b/g, "")
    .replace(/\bafc\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function teamMatch(db: string, api: string): boolean {
  const a = norm(db);
  const b = norm(api ?? "");
  if (!a || !b) return false;
  const aWords = new Set(a.split(" ").filter(Boolean));
  const bWords = new Set(b.split(" ").filter(Boolean));
  const overlap = [...aWords].filter((w) => bWords.has(w)).length;
  return overlap >= 1;
}

export interface SyncResultsOptions {
  dateFrom: string;
  dateTo: string;
  supabaseUrl: string;
  serviceKey: string;
  footballDataToken: string;
}

export interface SyncResultsResult {
  api_matches: number;
  db_fixtures_in_range: number;
  updated: number;
}

/**
 * Fetches Premier League matches from Football-Data.org for the date range,
 * matches them to fixtures (by kickoff hour + team names), and updates
 * status and home_goals/away_goals. Does not settle predictions .
 */
export async function syncResultsFromFootballData(options: SyncResultsOptions): Promise<SyncResultsResult> {
  const { dateFrom, dateTo, supabaseUrl, serviceKey, footballDataToken } = options;
  const supabase = createClient(supabaseUrl, serviceKey);

  const url = `https://api.football-data.org/v4/competitions/PL/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const res = await fetch(url, {
    headers: { "X-Auth-Token": footballDataToken },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Football-Data request failed: ${res.status} ${text}`);
  const json = JSON.parse(text);
  const matches = json.matches ?? [];

  // Fixtures in the same date range
  const { data: dbFixtures, error: dbErr } = await supabase
    .from("fixtures")
    .select("id, kickoff_time, home_team, away_team")
    .eq("season", DEFAULT_SEASON)
    .gte("kickoff_time", `${dateFrom}T00:00:00Z`)
    .lte("kickoff_time", `${dateTo}T23:59:59Z`);

  if (dbErr) throw new Error(dbErr.message);
  const dbList = dbFixtures ?? [];

  let updated = 0;
  for (const m of matches) {
    // Match API match to our fixture: same kickoff and team names 
    const apiKick = m.utcDate ? new Date(m.utcDate).toISOString().slice(0, 13) : "";
    const apiHome = m.homeTeam?.name ?? "";
    const apiAway = m.awayTeam?.name ?? "";

    const dbMatch = dbList.find((f: { kickoff_time: string; home_team: string; away_team: string }) => {
      const dbKick = f.kickoff_time.slice(0, 13);
      return dbKick === apiKick && teamMatch(f.home_team, apiHome) && teamMatch(f.away_team, apiAway);
    });
    if (!dbMatch) continue;

    const home = m.score?.fullTime?.home;
    const away = m.score?.fullTime?.away;
    const status = String(m.status || "").toUpperCase() === "FINISHED" ? "finished" : "scheduled";
    const hasScore = typeof home === "number" && typeof away === "number";

    const update: Record<string, unknown> = { status };
    if (hasScore) {
      update.home_goals = home;
      update.away_goals = away;
    }

    const { error } = await supabase.from("fixtures").update(update).eq("id", dbMatch.id);
    if (!error) updated++;
  }

  return { api_matches: matches.length, db_fixtures_in_range: dbList.length, updated };
}
