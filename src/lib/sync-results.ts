/**
 * Sync fixture results from Football-Data.org into Supabase.
 */
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
  db_with_external_id: number;
  details?: Array<{
    home_team: string;
    away_team: string;
    matched: boolean;
    fixture_id: string | null;
    updated: boolean;
    applied_update?: { status: string; home_goals: number | null; away_goals: number | null };
    skipped_no_overwrite?: boolean;
    error?: string;
  }>;
}

/**
 * Fetches matches for the date range, matches them to fixtures, updates status and home_goals/away_goals.
 */
type ApiMatchWithScore = { score?: { fullTime?: { home?: number; away?: number; homeTeam?: number; awayTeam?: number } } };

function getFullTimeScore(m: ApiMatchWithScore) {
  const ft = m.score?.fullTime;
  if (!ft) return { home: null, away: null };
  const home = ft.home ?? ft.homeTeam ?? null;
  const away = ft.away ?? ft.awayTeam ?? null;
  return { home: typeof home === "number" ? home : null, away: typeof away === "number" ? away : null };
}

function mapApiStatusToDb(apiStatus: string): "finished" | "in_play" | "scheduled" {
  const u = apiStatus.toUpperCase();
  if (u === "FINISHED") return "finished";
  if (["IN_PLAY", "1H", "2H", "HT", "PAUSED", "LIVE"].includes(u)) return "in_play";
  return "scheduled";
}

const KICKOFF_LIKELY_FINISHED_MS = 2.5 * 60 * 60 * 1000; 
const KICKOFF_IN_PAST_MS = 90 * 60 * 1000;  
/** If kickoff passed but API still TIMED/SCHEDULED and lastUpdated is this long after kickoff, consider stuck */
const STUCK_LAST_UPDATED_OLDER_THAN_MS = 6 * 60 * 60 * 1000;
const UTCDATE_TOLERANCE_MS = 2 * 60 * 60 * 1000; 

export async function syncResultsFromFootballData(options: SyncResultsOptions): Promise<SyncResultsResult> {
  const { dateFrom, dateTo, supabaseUrl, serviceKey, footballDataToken} = options;
  const supabase = createClient(supabaseUrl, serviceKey);

  const cacheBust = `_t=${Date.now()}`;
  const apiHeaders = {
    "X-Auth-Token": footballDataToken,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  };
  const fetchOpts = { headers: apiHeaders, cache: "no-store" as RequestCache };

  const compUrl = `https://api.football-data.org/v4/competitions/PL/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&${cacheBust}`;
  const res = await fetch(compUrl, fetchOpts);
  const text = await res.text();
  if (!res.ok) throw new Error(`Football-Data request failed: ${res.status} ${text}`);
  const json = JSON.parse(text);
  const matches = json.matches ?? [];

  const globalMatchesById: Map<string, (typeof matches)[0]> = new Map();
  try {
    const globalUrl = `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&${cacheBust}`;
    const globalRes = await fetch(globalUrl, fetchOpts);
    if (globalRes.ok) {
      const globalJson = await globalRes.json();
      const globalList = globalJson.matches ?? [];
      for (const gm of globalList) {
        if (gm.id != null) globalMatchesById.set(String(gm.id), gm);
      }
    }
  } catch {
  }

  const { data: dbFixtures, error: dbErr } = await supabase
    .from("fixtures")
    .select("id, kickoff_time, home_team, away_team, status, home_goals, away_goals, external_source, external_id, provider_last_updated, is_stuck, last_checked_at")
    .gte("kickoff_time", `${dateFrom}T00:00:00Z`)
    .lte("kickoff_time", `${dateTo}T23:59:59Z`);

  if (dbErr) throw new Error(dbErr.message);
  const dbList = dbFixtures ?? [];

  const dbWithExternalId = dbList.filter(
    (f: { external_source?: string; external_id?: string }) => f.external_source === "football-data" && f.external_id
  ).length;
  const apiIdToFixture = new Map<string, (typeof dbList)[0]>();
  for (const f of dbList) {
    const row = f as { external_source?: string; external_id?: string };
    if (row.external_source === "football-data" && row.external_id) {
      apiIdToFixture.set(String(row.external_id), f);
    }
  }

  const details: SyncResultsResult["details"] = [];
  let updated = 0;

  for (const m of matches) {
    let apiId = m.id != null ? String(m.id) : "";
    const apiDate = m.utcDate ? new Date(m.utcDate).toISOString().slice(0, 10) : "";
    const apiKickHour = m.utcDate ? new Date(m.utcDate).toISOString().slice(0, 13) : "";
    let apiHome = m.homeTeam?.name ?? "";
    let apiAway = m.awayTeam?.name ?? "";
    let apiStatus = String(m.status ?? "");
    let homeScore: number | null = getFullTimeScore(m).home;
    let awayScore: number | null = getFullTimeScore(m).away;

    let usedGlobalFallback = false;
    let globalLastUpdated: string | null = null;
    const globalMatch = apiId ? globalMatchesById.get(apiId) : undefined;
    if (globalMatch) {
      const gStatus = String((globalMatch as { status?: string }).status ?? "");
      const gScore = getFullTimeScore(globalMatch as ApiMatchWithScore);
      if (gStatus === "FINISHED" && gScore.home != null && gScore.away != null) {
        if (apiStatus !== "FINISHED" || homeScore === null || awayScore === null) {
          apiStatus = gStatus;
          homeScore = gScore.home;
          awayScore = gScore.away;
          usedGlobalFallback = true;
          globalLastUpdated = (globalMatch as { lastUpdated?: string }).lastUpdated ?? null;
        }
      }
    }

    const kickoffMs = m.utcDate ? new Date(m.utcDate).getTime() : 0;
    const kickoffLikelyFinished = kickoffMs > 0 && kickoffMs < Date.now() - KICKOFF_LIKELY_FINISHED_MS;
    const kickoffInPast = kickoffMs > 0 && kickoffMs < Date.now() - KICKOFF_IN_PAST_MS;
    const apiSaysStale =
      (apiStatus.toUpperCase() === "TIMED" || ["IN_PLAY", "1H", "2H", "HT"].includes(apiStatus.toUpperCase())) &&
      homeScore === null &&
      awayScore === null &&
      kickoffLikelyFinished;
    const fetchSingleMatch = Boolean(apiId && (apiSaysStale || kickoffInPast) && !usedGlobalFallback);
    let singleMatchResponse:
      | { status: string; full_time_home: number | null; full_time_away: number | null; last_updated?: string }
      | undefined;

    if (fetchSingleMatch) {
      try {
        const singleUrl = `https://api.football-data.org/v4/matches/${apiId}?${cacheBust}`;
        const singleRes = await fetch(singleUrl, {
          headers: {
            "X-Auth-Token": footballDataToken,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
          cache: "no-store",
        });
        const singleJson = await singleRes.json();
        if (singleRes.ok && singleJson) {
          const s = getFullTimeScore(singleJson);
          singleMatchResponse = {
            status: String(singleJson.status ?? ""),
            full_time_home: s.home,
            full_time_away: s.away,
            last_updated: singleJson.lastUpdated,
          };
          apiStatus = singleMatchResponse.status;
          apiHome = singleJson.homeTeam?.name ?? apiHome;
          apiAway = singleJson.awayTeam?.name ?? apiAway;
          homeScore = s.home;
          awayScore = s.away;
        }
      } catch {
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    let dbMatch = apiId ? apiIdToFixture.get(apiId) ?? null : null;
    if (!dbMatch) {
      dbMatch =
        dbList.find((f: { kickoff_time: string; home_team: string; away_team: string }) => {
          const dbKickHour = f.kickoff_time.slice(0, 13);
          const dbDate = f.kickoff_time.slice(0, 10);
          const teamsOk = teamMatch(f.home_team, apiHome) && teamMatch(f.away_team, apiAway);
          if (!teamsOk) return false;
          if (dbKickHour === apiKickHour) return true;
          return dbDate === apiDate;
        }) ?? null;
    }

    if (
      apiId &&
      dbMatch &&
      !singleMatchResponse &&
      (apiStatus.toUpperCase() === "TIMED" || ["IN_PLAY", "1H", "2H", "HT"].includes(apiStatus.toUpperCase())) &&
      homeScore === null &&
      awayScore === null
    ) {
      const dbKickoffMs = (dbMatch as { kickoff_time: string }).kickoff_time
        ? new Date((dbMatch as { kickoff_time: string }).kickoff_time).getTime()
        : 0;
      const dbKickoffInPast = dbKickoffMs > 0 && dbKickoffMs < Date.now() - KICKOFF_IN_PAST_MS;
      if (dbKickoffInPast) {
        try {
          const singleUrl = `https://api.football-data.org/v4/matches/${apiId}?${cacheBust}`;
          const singleRes = await fetch(singleUrl, {
            headers: {
              "X-Auth-Token": footballDataToken,
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
            },
            cache: "no-store",
          });
          const singleJson = await singleRes.json();
          if (singleRes.ok && singleJson) {
            const s = getFullTimeScore(singleJson);
          singleMatchResponse = {
            status: String(singleJson.status ?? ""),
            full_time_home: s.home,
            full_time_away: s.away,
            last_updated: singleJson.lastUpdated,
          };
            apiStatus = singleMatchResponse.status;
            homeScore = s.home;
            awayScore = s.away;
          }
        } catch {
          // keep list data
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    let effectiveLastUpdated: string | null =
      singleMatchResponse?.last_updated ?? globalLastUpdated ?? (m as { lastUpdated?: string }).lastUpdated ?? null;
    let hasScore = homeScore !== null && awayScore !== null;
    let dbStatus = mapApiStatusToDb(apiStatus);

    const effectiveLastUpdatedMs = effectiveLastUpdated ? new Date(effectiveLastUpdated).getTime() : 0;
    const isStuck =
      kickoffInPast &&
      (apiStatus.toUpperCase() === "TIMED" || apiStatus.toUpperCase() === "SCHEDULED") &&
      !hasScore &&
      (effectiveLastUpdatedMs === 0 || Date.now() - effectiveLastUpdatedMs > STUCK_LAST_UPDATED_OLDER_THAN_MS);

    let replacement: (typeof matches)[0] | undefined;
    if (isStuck && dbMatch && apiId) {
      const dbKickoffMs = (dbMatch as { kickoff_time: string }).kickoff_time
        ? new Date((dbMatch as { kickoff_time: string }).kickoff_time).getTime()
        : 0;
      const homeId = (m as { homeTeam?: { id?: number } }).homeTeam?.id;
      const awayId = (m as { awayTeam?: { id?: number } }).awayTeam?.id;
      replacement = matches.find((other: ApiMatchWithScore & { id?: number; utcDate?: string; homeTeam?: { id?: number }; awayTeam?: { id?: number }; status?: string }) => {
        if (other.id == null || String(other.id) === apiId) return false;
        if (homeId == null || awayId == null) return false;
        const sameTeams = other.homeTeam?.id === homeId && other.awayTeam?.id === awayId;
        if (!sameTeams) return false;
        const otherKickMs = other.utcDate ? new Date(other.utcDate).getTime() : 0;
        if (Math.abs(otherKickMs - dbKickoffMs) > UTCDATE_TOLERANCE_MS) return false;
        const otherScore = getFullTimeScore(other);
        const otherHasScore = otherScore.home != null && otherScore.away != null;
        return other.status === "FINISHED" || otherHasScore;
      });
      if (replacement) {
        const r = replacement as { id: number; status: string; lastUpdated?: string };
        apiId = String(r.id);
        apiStatus = String(r.status ?? "");
        const rs = getFullTimeScore(replacement);
        homeScore = rs.home;
        awayScore = rs.away;
        hasScore = homeScore !== null && awayScore !== null;
        dbStatus = mapApiStatusToDb(apiStatus);
        if (apiIdToFixture) apiIdToFixture.set(apiId, dbMatch);
        effectiveLastUpdated = r.lastUpdated ?? effectiveLastUpdated;
      }
    }

    const update: Record<string, unknown> = { status: dbStatus };
    if (hasScore) {
      update.home_goals = homeScore;
      update.away_goals = awayScore;
    }
    const appliedUpdate = {
      status: dbStatus,
      home_goals: hasScore ? homeScore : null,
      away_goals: hasScore ? awayScore : null,
    };

    if (!dbMatch) continue;

    const existing = dbMatch as { status?: string; home_goals?: number | null; away_goals?: number | null };
    const existingStatus = (existing.status ?? "").toLowerCase();
    const existingHasScore =
      existing.home_goals != null &&
      existing.away_goals != null &&
      Number.isInteger(Number(existing.home_goals)) &&
      Number.isInteger(Number(existing.away_goals));

    const dbProviderUpdated = (dbMatch as { provider_last_updated?: string | null }).provider_last_updated;
    const dbProviderMs = dbProviderUpdated ? new Date(dbProviderUpdated).getTime() : 0;
    const apiNewer =
      effectiveLastUpdated == null || new Date(effectiveLastUpdated).getTime() > dbProviderMs;
    const markingStuck = isStuck && !hasScore;
    // When API has a score and DB doesn't, always apply 
    const shouldUpdateByScore = hasScore && !existingHasScore;
    if (!apiNewer && !markingStuck && !shouldUpdateByScore) continue;

    const wouldOverwriteGoodWithStale =
      dbStatus === "scheduled" && !hasScore && (existingStatus === "finished" || existingHasScore);

    let updatePayload: Record<string, unknown>;
    if (wouldOverwriteGoodWithStale) {

      updatePayload = {
        is_stuck: true,
        last_checked_at: new Date().toISOString(),
      };
      if (effectiveLastUpdated) updatePayload.provider_last_updated = effectiveLastUpdated;
    } else {
      updatePayload = { ...update };
    }

    if (apiId && (dbMatch as { external_id?: string }).external_id !== apiId) {
      updatePayload.external_source = "football-data";
      updatePayload.external_id = apiId;
    }
    if (effectiveLastUpdated) {
      updatePayload.provider_last_updated = effectiveLastUpdated;
    }
    updatePayload.is_stuck = !hasScore && isStuck;
    updatePayload.last_checked_at = new Date().toISOString();

    const { error } = await supabase.from("fixtures").update(updatePayload).eq("id", dbMatch.id);
    if (error) {
      // update failed; skip incrementing updated
    } else {
      updated++;
    }
  }

  return {
    api_matches: matches.length,
    db_fixtures_in_range: dbList.length,
    db_with_external_id: dbWithExternalId,
    updated,
    details,
  };
}

export interface ResyncSingleFixtureOptions {
  fixtureId: string;
  supabaseUrl: string;
  serviceKey: string;
  footballDataToken: string;
}

export interface ResyncSingleFixtureResult {
  success: boolean;
  error?: string;
  updated: boolean;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
  replaced_provider_id?: string;
  is_stuck: boolean;
}

/**
 * Re-fetches one fixture from Football-Data.org (single match + competition list),
 * applies stuck/replacement logic, updates the fixture, and returns the new state.
 * Does not settle predictions; caller should call settlement if status is finished.
 */
export async function resyncSingleFixture(
  options: ResyncSingleFixtureOptions
): Promise<ResyncSingleFixtureResult> {
  const { fixtureId, supabaseUrl, serviceKey, footballDataToken } = options;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: fixture, error: fetchErr } = await supabase
    .from("fixtures")
    .select("id, kickoff_time, home_team, away_team, external_source, external_id, provider_last_updated")
    .eq("id", fixtureId)
    .maybeSingle();

  if (fetchErr) {
    return { success: false, error: fetchErr.message, updated: false, status: "scheduled", home_goals: null, away_goals: null, is_stuck: false };
  }
  if (!fixture) {
    return { success: false, error: "Fixture not found", updated: false, status: "scheduled", home_goals: null, away_goals: null, is_stuck: false };
  }
  if ((fixture as { external_source?: string }).external_source !== "football-data" || !(fixture as { external_id?: string }).external_id) {
    return { success: false, error: "Fixture has no football-data external_id", updated: false, status: "scheduled", home_goals: null, away_goals: null, is_stuck: false };
  }

  const cacheBust = `_t=${Date.now()}`;
  const headers = {
    "X-Auth-Token": footballDataToken,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  };
  let apiId = String((fixture as { external_id: string }).external_id);
  const kickoffIso = (fixture as { kickoff_time: string }).kickoff_time;
  const kickoffMs = new Date(kickoffIso).getTime();
  const kickoffDate = kickoffIso.slice(0, 10);
  const dateFrom = new Date(kickoffMs - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dateTo = new Date(kickoffMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let singleJson: { status?: string; lastUpdated?: string; score?: { fullTime?: { home?: number; away?: number } }; homeTeam?: { id?: number; name?: string }; awayTeam?: { id?: number; name?: string } } | null = null;
  try {
    const singleRes = await fetch(
      `https://api.football-data.org/v4/matches/${apiId}?${cacheBust}`,
      { headers, cache: "no-store" }
    );
    singleJson = singleRes.ok ? await singleRes.json() : null;
  } catch {
    singleJson = null;
  }

  const compRes = await fetch(
    `https://api.football-data.org/v4/competitions/PL/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&${cacheBust}`,
    { headers, cache: "no-store" }
  );
  const compJson = compRes.ok ? await compRes.json() : {};
  const listMatches = compJson.matches ?? [];

  let apiStatus = singleJson ? String(singleJson.status ?? "") : "TIMED";
  let homeScore: number | null = singleJson ? getFullTimeScore(singleJson).home : null;
  let awayScore: number | null = singleJson ? getFullTimeScore(singleJson).away : null;
  let effectiveLastUpdated: string | null = singleJson?.lastUpdated ?? null;
  const homeId = singleJson?.homeTeam?.id;
  const awayId = singleJson?.awayTeam?.id;

  const kickoffInPast = kickoffMs > 0 && kickoffMs < Date.now() - KICKOFF_IN_PAST_MS;
  const hasScore = homeScore !== null && awayScore !== null;
  const effectiveLastUpdatedMs = effectiveLastUpdated ? new Date(effectiveLastUpdated).getTime() : 0;
  const isStuck =
    kickoffInPast &&
    (apiStatus.toUpperCase() === "TIMED" || apiStatus.toUpperCase() === "SCHEDULED") &&
    !hasScore &&
    (effectiveLastUpdatedMs === 0 || Date.now() - effectiveLastUpdatedMs > STUCK_LAST_UPDATED_OLDER_THAN_MS);

  let replacedProviderId: string | undefined;
  if (isStuck && homeId != null && awayId != null) {
    const replacement = listMatches.find((other: ApiMatchWithScore & { id?: number; utcDate?: string; homeTeam?: { id?: number }; awayTeam?: { id?: number }; status?: string }) => {
      if (other.id == null || String(other.id) === apiId) return false;
      if (other.homeTeam?.id === homeId && other.awayTeam?.id === awayId) {
        const otherKickMs = other.utcDate ? new Date(other.utcDate).getTime() : 0;
        if (Math.abs(otherKickMs - kickoffMs) <= UTCDATE_TOLERANCE_MS) {
          const os = getFullTimeScore(other);
          return other.status === "FINISHED" || (os.home != null && os.away != null);
        }
      }
      return false;
    });
    if (replacement) {
      const r = replacement as { id: number; status: string; lastUpdated?: string };
      replacedProviderId = String(r.id);
      apiId = replacedProviderId;
      apiStatus = String(r.status ?? "");
      const rs = getFullTimeScore(replacement);
      homeScore = rs.home;
      awayScore = rs.away;
      effectiveLastUpdated = (r as { lastUpdated?: string }).lastUpdated ?? effectiveLastUpdated;
    }
  }

  const dbStatus = mapApiStatusToDb(apiStatus);
  const hasScoreFinal = homeScore !== null && awayScore !== null;
  const dbProviderUpdated = (fixture as { provider_last_updated?: string | null }).provider_last_updated;
  const dbProviderMs = dbProviderUpdated ? new Date(dbProviderUpdated).getTime() : 0;
  const apiNewer = effectiveLastUpdated == null || new Date(effectiveLastUpdated).getTime() > dbProviderMs;
  const markingStuck = isStuck && !hasScoreFinal;
  const shouldUpdate = apiNewer || markingStuck;

  if (shouldUpdate) {
    const updatePayload: Record<string, unknown> = {
      is_stuck: !hasScoreFinal && isStuck,
      last_checked_at: new Date().toISOString(),
    };
    if (hasScoreFinal) {
      updatePayload.status = dbStatus;
      updatePayload.home_goals = homeScore;
      updatePayload.away_goals = awayScore;
    } else {
      updatePayload.status = (fixture as { status?: string }).status ?? "scheduled";
    }
    if (replacedProviderId) {
      updatePayload.external_id = replacedProviderId;
    }
    if (effectiveLastUpdated) updatePayload.provider_last_updated = effectiveLastUpdated;

    const { error: updateErr } = await supabase.from("fixtures").update(updatePayload).eq("id", fixtureId);
    if (updateErr) {
      return {
        success: false,
        error: updateErr.message,
        updated: false,
        status: dbStatus,
        home_goals: homeScore,
        away_goals: awayScore,
        replaced_provider_id: replacedProviderId,
        is_stuck: !hasScoreFinal && isStuck,
      };
    }
  }

  return {
    success: true,
    updated: shouldUpdate,
    status: dbStatus,
    home_goals: homeScore,
    away_goals: awayScore,
    replaced_provider_id: replacedProviderId,
    is_stuck: !hasScoreFinal && isStuck,
  };
}