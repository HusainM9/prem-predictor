/**
 * Server-side standings fetch. Cached for 1 hour. One snapshot per hour.
 */

export const STANDINGS_REVALIDATE_SEC = 60 * 60;
export const STANDINGS_CACHE_TAG = "standings";

export type StandingsData = {
  competition?: { name: string; code: string };
  season?: { currentMatchday?: number };
  standings?: Array<{
    type: string;
    table: Array<{
      position: number;
      team: { id: number; name: string; shortName: string; crest?: string };
      playedGames: number;
      won: number;
      draw: number;
      lost: number;
      points: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDifference: number;
      form?: string;
    }>;
  }>;
};

export type StandingsResult =
  | { data: StandingsData; error?: undefined; stale?: boolean }
  | { data?: undefined; error: string; status?: number };

/** Fetches Premier League standings from Football-Data.org */
export async function getStandings(): Promise<StandingsResult> {
  const token = process.env.FOOTBALL_DATA_API_KEY;
  if (!token) {
    return { error: "FOOTBALL_DATA_API_KEY not set", status: 500 };
  }

  const url = "https://api.football-data.org/v4/competitions/PL/standings";
  const res = await fetch(url, {
    headers: { "X-Auth-Token": token },
    next: { revalidate: STANDINGS_REVALIDATE_SEC, tags: [STANDINGS_CACHE_TAG] },
  });
  const text = await res.text();

  if (!res.ok) {
    // Fallback: if provider is rate-limiting now, try to serve the last cached snapshot.
    if (res.status === 429) {
      const cachedRes = await fetch(url, {
        headers: { "X-Auth-Token": token },
        cache: "force-cache",
      });
      if (cachedRes.ok) {
        const cachedText = await cachedRes.text();
        try {
          const cachedData = JSON.parse(cachedText) as StandingsData;
          return { data: cachedData, stale: true };
        } catch {
          // Continue to normal error handling if cached payload can't be parsed.
        }
      }
    }

    let message = "Standings request failed";
    if (res.status === 429) {
      message = "Data provider rate limit (429). Try again in a minute.";
    } else if (res.status === 403) {
      message = "Access denied (403). Standings may not be included in your API plan.";
    } else {
      try {
        const parsed = JSON.parse(text) as { message?: string; error?: string };
        const apiMsg = parsed.message ?? parsed.error;
        if (apiMsg) message += ` — ${String(apiMsg).slice(0, 120)}`;
      } catch {
        if (text.length < 200) message += ` — ${text}`;
      }
    }
    return { error: message, status: res.status === 429 ? 429 : 500 };
  }

  const data = JSON.parse(text) as StandingsData;
  return { data, stale: false };
}
