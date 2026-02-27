import { describe, it, expect } from "vitest";
import { getLockedOddsForPick } from "./route";

describe("lock-odds: odds locked correctly per pick", () => {
  const odds = { home: 2.1, draw: 3.4, away: 3.2 };

  it("locks home odds for pick H", () => {
    expect(getLockedOddsForPick("H", odds)).toBe(2.1);
  });

  it("locks draw odds for pick D", () => {
    expect(getLockedOddsForPick("D", odds)).toBe(3.4);
  });

  it("locks away odds for pick A", () => {
    expect(getLockedOddsForPick("A", odds)).toBe(3.2);
  });

  it("uses away odds for unknown pick (fallback)", () => {
    expect(getLockedOddsForPick("", odds)).toBe(3.2);
    expect(getLockedOddsForPick("X", odds)).toBe(3.2);
  });

  it("matches real fixture odds (e.g. 5.5 for home)", () => {
    const fixtureOdds = { home: 5.5, draw: 4.0, away: 1.65 };
    expect(getLockedOddsForPick("H", fixtureOdds)).toBe(5.5);
    expect(getLockedOddsForPick("D", fixtureOdds)).toBe(4.0);
    expect(getLockedOddsForPick("A", fixtureOdds)).toBe(1.65);
  });
});
