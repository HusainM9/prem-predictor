import { describe, it, expect } from "vitest";
import { sumTotalPointsFromByGameweek } from "./history";

describe("sumTotalPointsFromByGameweek", () => {
  it("returns 0 for empty object", () => {
    expect(sumTotalPointsFromByGameweek({})).toBe(0);
  });

  it("sums total_points from a single gameweek", () => {
    expect(
      sumTotalPointsFromByGameweek({
        "1": { total_points: 12 },
      })
    ).toBe(12);
  });

  it("sums total_points across multiple gameweeks", () => {
    expect(
      sumTotalPointsFromByGameweek({
        "1": { total_points: 8 },
        "2": { total_points: 15 },
        "3": { total_points: 10 },
      })
    ).toBe(33);
  });

  it("handles string keys (API shape)", () => {
    expect(
      sumTotalPointsFromByGameweek({
        "10": { total_points: 5 },
        "11": { total_points: 7 },
      })
    ).toBe(12);
  });

  it("handles zero points in a gameweek", () => {
    expect(
      sumTotalPointsFromByGameweek({
        "1": { total_points: 0 },
        "2": { total_points: 3 },
      })
    ).toBe(3);
  });
});
