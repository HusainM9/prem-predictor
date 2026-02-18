/**
 * Parse gameweek filter from user input. Returns null for global leaderboard
 * when input is empty, 0, or not a positive integer.
 */
export function getEffectiveGameweek(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * Build the leaderboard page title from context.
 * - No leagueId: "Global leaderboard" or "Leaderboard (GW N)"
 * - With leagueId: "{leagueName} leaderboard" or "{leagueName} leaderboard (GW N)"; falls back to "League leaderboard" when leagueName is null/empty.
 */
export function getLeaderboardTitle(
  leagueName: string | null,
  leagueId: string | null,
  effectiveGameweek: number | null
): string {
  const gwSuffix = effectiveGameweek != null ? ` (GW ${effectiveGameweek})` : "";
  if (!leagueId || leagueId.trim() === "") {
    return effectiveGameweek != null ? `Leaderboard${gwSuffix}` : "Global leaderboard";
  }
  const name = (leagueName ?? "").trim();
  const base = name ? `${name} leaderboard` : "League leaderboard";
  return base + gwSuffix;
}

export type PredictionRow = {
  user_id: string;
  points_awarded: number | null;
  bonus_exact_score_points: number | null;
  fixture_id: string;
};

export type LeaderboardUserAggregate = {
  user_id: string;
  total_points: number;
  /** Number of correct result predictions (points_awarded > 0). Tie-breaker 1. */
  accuracy: number;
  /** Number of exact score predictions (bonus_exact_score_points > 0). Tie-breaker 2. */
  correct_scores: number;
};

/**
 * Aggregate prediction rows by user: total points, correct results, exact scores.
 * Sorted by: total_points DESC.
 */
export function aggregatePointsByUser(
  rows: PredictionRow[]
): LeaderboardUserAggregate[] {
  const byUser = new Map<
    string,
    { total_points: number; accuracy: number; correct_scores: number }
  >();
  for (const r of rows) {
    const total = (r.points_awarded ?? 0) + (r.bonus_exact_score_points ?? 0);
    const accuracy = (r.points_awarded ?? 0) > 0 ? 1 : 0;
    const correct_scores = (r.bonus_exact_score_points ?? 0) > 0 ? 1 : 0;
    const cur = byUser.get(r.user_id);
    if (!cur) {
      byUser.set(r.user_id, {
        total_points: total,
        accuracy,
        correct_scores,
      });
    } else {
      cur.total_points += total;
      cur.accuracy += accuracy;
      cur.correct_scores += correct_scores;
    }
  }
  return [...byUser.entries()]
    .map(([user_id, agg]) => ({
      user_id,
      total_points: agg.total_points,
      accuracy: agg.accuracy,
      correct_scores: agg.correct_scores,
    }))
    .sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      return b.correct_scores - a.correct_scores;
    });
}

export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  display_name: string;
  total_points: number;
  accuracy: number;
  correct_scores: number;
};

/**
 * Ranked entries with display names, apply search filter and pagination.
 */
export function buildLeaderboardPage(
  sortedByUser: LeaderboardUserAggregate[],
  nameByUser: Map<string, string>,
  search: string,
  offset: number,
  limit: number
): { entries: LeaderboardEntry[]; total_count: number } {
  let entries: LeaderboardEntry[] = sortedByUser.map((e, i) => ({
    rank: i + 1,
    user_id: e.user_id,
    display_name: nameByUser.get(e.user_id) ?? "Player",
    total_points: e.total_points,
    accuracy: e.accuracy,
    correct_scores: e.correct_scores,
  }));

  const trimmedSearch = search.trim();
  if (trimmedSearch !== "") {
    const term = trimmedSearch.toLowerCase();
    entries = entries.filter((e) =>
      (e.display_name ?? "").toLowerCase().includes(term)
    );
  }

  const total_count = entries.length;
  const paginated = entries.slice(offset, offset + limit);
  return { entries: paginated, total_count };
}

/**
 * Limit to max 50.
 */
export function parseLeaderboardPagination(
  limitParam: string | null,
  offsetParam: string | null,
  maxPageSize: number = 50
): { limit: number; offset: number } {
  const limit = Math.min(
    maxPageSize,
    Math.max(1, parseInt(limitParam ?? "50", 10) || 50)
  );
  const offset = Math.max(0, parseInt(offsetParam ?? "0", 10) || 0);
  return { limit, offset };
}
