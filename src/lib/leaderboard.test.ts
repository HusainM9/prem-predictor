import { describe, it, expect } from "vitest";
import {
  getEffectiveGameweek,
  getLeaderboardTitle,
  aggregatePointsByUser,
  buildLeaderboardPage,
  parseLeaderboardPagination,
  type PredictionRow,
} from "./leaderboard";

describe("getEffectiveGameweek", () => {
  it("returns null for empty string (global leaderboard)", () => {
    expect(getEffectiveGameweek("")).toBe(null);
    expect(getEffectiveGameweek("   ")).toBe(null);
  });

  it("returns null for 0 or negative (global leaderboard)", () => {
    expect(getEffectiveGameweek("0")).toBe(null);
    expect(getEffectiveGameweek("-1")).toBe(null);
    expect(getEffectiveGameweek("-5")).toBe(null);
  });

  it("returns the number for positive integer gameweeks", () => {
    expect(getEffectiveGameweek("1")).toBe(1);
    expect(getEffectiveGameweek("26")).toBe(26);
    expect(getEffectiveGameweek("  12  ")).toBe(12);
  });

  it("returns null for non-integers or invalid input", () => {
    expect(getEffectiveGameweek("1.5")).toBe(null);
    expect(getEffectiveGameweek("abc")).toBe(null);
    expect(getEffectiveGameweek("12.3")).toBe(null);
  });

  it("accepts string that parses to integer (e.g. 12.0) as that integer", () => {
    expect(getEffectiveGameweek("12.0")).toBe(12); // Number("12.0") === 12
  });
});

describe("getLeaderboardTitle", () => {
  it("returns Global leaderboard when no leagueId", () => {
    expect(getLeaderboardTitle(null, null, null)).toBe("Global leaderboard");
    expect(getLeaderboardTitle("Any League", null, null)).toBe("Global leaderboard");
    expect(getLeaderboardTitle(null, "", null)).toBe("Global leaderboard");
  });

  it("returns Leaderboard (GW N) for global when gameweek is set", () => {
    expect(getLeaderboardTitle(null, null, 26)).toBe("Leaderboard (GW 26)");
    expect(getLeaderboardTitle(null, "", 1)).toBe("Leaderboard (GW 1)");
  });

  it("returns league name in title when leagueId and leagueName are set", () => {
    expect(getLeaderboardTitle("Work League", "uuid-1", null)).toBe("Work League leaderboard");
    expect(getLeaderboardTitle("Family", "uuid-2", null)).toBe("Family leaderboard");
  });

  it("returns league name + GW when league and gameweek are set", () => {
    expect(getLeaderboardTitle("Work League", "uuid-1", 26)).toBe("Work League leaderboard (GW 26)");
  });

  it("falls back to League leaderboard when leagueId set but leagueName null or empty", () => {
    expect(getLeaderboardTitle(null, "uuid-1", null)).toBe("League leaderboard");
    expect(getLeaderboardTitle("", "uuid-1", null)).toBe("League leaderboard");
    expect(getLeaderboardTitle("   ", "uuid-1", null)).toBe("League leaderboard");
  });

  it("falls back to League leaderboard (GW N) when leagueId set, no name, gameweek set", () => {
    expect(getLeaderboardTitle(null, "uuid-1", 26)).toBe("League leaderboard (GW 26)");
  });
});

describe("aggregatePointsByUser", () => {
  it("sums points and counts accuracy (correct result) and correct_scores (exact score) per user", () => {
    const rows: PredictionRow[] = [
      { user_id: "u1", points_awarded: 10, bonus_exact_score_points: 5, fixture_id: "f1" },
      { user_id: "u1", points_awarded: 15, bonus_exact_score_points: 0, fixture_id: "f2" },
      { user_id: "u2", points_awarded: 20, bonus_exact_score_points: 10, fixture_id: "f1" },
    ];
    const result = aggregatePointsByUser(rows);
    expect(result).toHaveLength(2);
    const byUser = new Map(result.map((r) => [r.user_id, r]));
    expect(byUser.get("u1")).toEqual({ user_id: "u1", total_points: 30, accuracy: 2, correct_scores: 1 });
    expect(byUser.get("u2")).toEqual({ user_id: "u2", total_points: 30, accuracy: 1, correct_scores: 1 });
    expect(result.map((r) => r.total_points)).toEqual([30, 30]);
  });

  it("treats null points as 0; accuracy 0 when points_awarded 0, correct_scores 1 when bonus > 0", () => {
    const rows: PredictionRow[] = [
      { user_id: "u1", points_awarded: null, bonus_exact_score_points: 10, fixture_id: "f1" },
    ];
    const result = aggregatePointsByUser(rows);
    expect(result).toEqual([{ user_id: "u1", total_points: 10, accuracy: 0, correct_scores: 1 }]);
  });

  it("returns empty array for no rows", () => {
    expect(aggregatePointsByUser([])).toEqual([]);
  });

  it("sorts by total_points descending", () => {
    const rows: PredictionRow[] = [
      { user_id: "low", points_awarded: 5, bonus_exact_score_points: 0, fixture_id: "f1" },
      { user_id: "high", points_awarded: 50, bonus_exact_score_points: 10, fixture_id: "f1" },
      { user_id: "mid", points_awarded: 20, bonus_exact_score_points: 0, fixture_id: "f1" },
    ];
    const result = aggregatePointsByUser(rows);
    expect(result.map((r) => r.user_id)).toEqual(["high", "mid", "low"]);
  });

  it("breaks ties by accuracy (correct results) first", () => {
    const rows: PredictionRow[] = [
      { user_id: "A", points_awarded: 20, bonus_exact_score_points: 0, fixture_id: "f1" },
      { user_id: "B", points_awarded: 10, bonus_exact_score_points: 0, fixture_id: "f1" },
      { user_id: "B", points_awarded: 10, bonus_exact_score_points: 0, fixture_id: "f2" },
    ];
    const result = aggregatePointsByUser(rows);
    expect(result).toHaveLength(2);
    expect(result[0].total_points).toBe(20);
    expect(result[1].total_points).toBe(20);
    expect(result[0].user_id).toBe("B");
    expect(result[0].accuracy).toBe(2);
    expect(result[1].user_id).toBe("A");
    expect(result[1].accuracy).toBe(1);
  });

  it("breaks ties by correct_scores (exact scores) when points and accuracy are equal", () => {
    const rows: PredictionRow[] = [
      { user_id: "A", points_awarded: 10, bonus_exact_score_points: 0, fixture_id: "f1" },
      { user_id: "A", points_awarded: 10, bonus_exact_score_points: 0, fixture_id: "f2" },
      { user_id: "B", points_awarded: 10, bonus_exact_score_points: 5, fixture_id: "f1" },
      { user_id: "B", points_awarded: 5, bonus_exact_score_points: 0, fixture_id: "f2" },
    ];
    const result = aggregatePointsByUser(rows);
    expect(result).toHaveLength(2);
    expect(result[0].total_points).toBe(20);
    expect(result[1].total_points).toBe(20);
    expect(result[0].user_id).toBe("B");
    expect(result[0].accuracy).toBe(2);
    expect(result[0].correct_scores).toBe(1);
    expect(result[1].user_id).toBe("A");
    expect(result[1].correct_scores).toBe(0);
  });
});

describe("buildLeaderboardPage", () => {
  const sorted = [
    { user_id: "u1", total_points: 100, accuracy: 5, correct_scores: 2 },
    { user_id: "u2", total_points: 80, accuracy: 4, correct_scores: 1 },
    { user_id: "u3", total_points: 60, accuracy: 3, correct_scores: 0 },
  ];
  const names = new Map<string, string>([
    ["u1", "Alice"],
    ["u2", "Bob"],
    ["u3", "Charlie"],
  ]);

  it("assigns ranks, display names, accuracy and correct_scores", () => {
    const { entries, total_count } = buildLeaderboardPage(sorted, names, "", 0, 10);
    expect(total_count).toBe(3);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ rank: 1, user_id: "u1", display_name: "Alice", total_points: 100, accuracy: 5, correct_scores: 2 });
    expect(entries[1]).toEqual({ rank: 2, user_id: "u2", display_name: "Bob", total_points: 80, accuracy: 4, correct_scores: 1 });
    expect(entries[2]).toEqual({ rank: 3, user_id: "u3", display_name: "Charlie", total_points: 60, accuracy: 3, correct_scores: 0 });
  });

  it("uses Player for missing display names", () => {
    const { entries } = buildLeaderboardPage(sorted, new Map(), "", 0, 10);
    expect(entries.every((e) => e.display_name === "Player")).toBe(true);
  });

  it("filters by search without changing rank order", () => {
    const { entries, total_count } = buildLeaderboardPage(sorted, names, "ob", 0, 10);
    expect(total_count).toBe(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ rank: 2, user_id: "u2", display_name: "Bob", total_points: 80, accuracy: 4, correct_scores: 1 });
  });

  it("applies offset and limit", () => {
    const { entries, total_count } = buildLeaderboardPage(sorted, names, "", 1, 2);
    expect(total_count).toBe(3);
    expect(entries).toHaveLength(2);
    expect(entries[0].rank).toBe(2);
    expect(entries[1].rank).toBe(3);
  });

  it("returns empty entries when offset past end", () => {
    const { entries, total_count } = buildLeaderboardPage(sorted, names, "", 10, 5);
    expect(total_count).toBe(3);
    expect(entries).toEqual([]);
  });

  it("search is case-insensitive", () => {
    const { entries } = buildLeaderboardPage(sorted, names, "ALICE", 0, 10);
    expect(entries).toHaveLength(1);
    expect(entries[0].display_name).toBe("Alice");
  });
});

describe("parseLeaderboardPagination", () => {
  it("parses limit and offset from strings", () => {
    expect(parseLeaderboardPagination("25", "0")).toEqual({ limit: 25, offset: 0 });
    expect(parseLeaderboardPagination("50", "100")).toEqual({ limit: 50, offset: 100 });
  });

  it("defaults limit 50 and offset 0 when null", () => {
    expect(parseLeaderboardPagination(null, null)).toEqual({ limit: 50, offset: 0 });
  });

  it("clamps limit to maxPageSize (50)", () => {
    expect(parseLeaderboardPagination("100", "0", 50)).toEqual({ limit: 50, offset: 0 });
    expect(parseLeaderboardPagination("999", "0", 50)).toEqual({ limit: 50, offset: 0 });
  });

  it("ensures limit at least 1 and offset at least 0", () => {
    expect(parseLeaderboardPagination("0", "-5", 50)).toEqual({ limit: 50, offset: 0 });
  });
});
