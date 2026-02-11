import { describe, it, expect } from "vitest";
import { getEffectiveGameweek } from "./leaderboard";

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
