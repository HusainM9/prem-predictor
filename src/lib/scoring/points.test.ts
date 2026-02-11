import { describe, it, expect } from "vitest";
import { scorePrediction, potentialPoints } from "./points";

describe("scorePrediction", () => {
  it("awards 0 when result is wrong", () => {
    const result = scorePrediction(
      { pick: "H", stake: 10, locked_odds: 2.5, pred_home_goals: 2, pred_away_goals: 1 },
      { home_goals: 1, away_goals: 2 }
    );
    expect(result.points_awarded).toBe(0);
    expect(result.bonus_exact_score_points).toBe(0);
    expect(result.bonus_points).toBe(0);
  });

  it("awards 10×odds − 10 for correct result (home win)", () => {
    const result = scorePrediction(
      { pick: "H", stake: 10, locked_odds: 2.5, pred_home_goals: 2, pred_away_goals: 1 },
      { home_goals: 3, away_goals: 0 }
    );
    expect(result.points_awarded).toBe(15); // 10*2.5 - 10 = 15
    expect(result.bonus_exact_score_points).toBe(0);
  });

  it("awards 10×odds − 10 for correct result (draw)", () => {
    const result = scorePrediction(
      { pick: "D", stake: 10, locked_odds: 3.2, pred_home_goals: 1, pred_away_goals: 1 },
      { home_goals: 0, away_goals: 0 }
    );
    expect(result.points_awarded).toBe(22); // 10*3.2 - 10 = 22
    expect(result.bonus_exact_score_points).toBe(0);
  });

  it("awards exact score bonus = 1.5× result points when score is exact", () => {
    const result = scorePrediction(
      { pick: "H", stake: 10, locked_odds: 2.5, pred_home_goals: 2, pred_away_goals: 1 },
      { home_goals: 2, away_goals: 1 }
    );
    expect(result.points_awarded).toBe(15);
    expect(result.bonus_exact_score_points).toBe(23); // round(1.5 * 15)
    expect(result.bonus_points).toBe(23);
  });

  it("awards positive points when locked_odds is null for correct result (default odds 2)", () => {
    const result = scorePrediction(
      { pick: "H", stake: 10, locked_odds: null, pred_home_goals: 1, pred_away_goals: 0 },
      { home_goals: 1, away_goals: 0 }
    );
    expect(result.points_awarded).toBe(10); // 10*2 - 10
    expect(result.bonus_exact_score_points).toBe(15); // round(1.5 * 10)
  });
});

describe("potentialPoints", () => {
  it("computes result points as 10×odds − 10", () => {
    expect(potentialPoints(2.5).resultPoints).toBe(15);
    expect(potentialPoints(3.2).resultPoints).toBe(22);
    expect(potentialPoints(1.5).resultPoints).toBe(5);
  });

  it("computes exact score bonus as 1.5× result points", () => {
    const { resultPoints, exactScoreBonus } = potentialPoints(2.5);
    expect(resultPoints).toBe(15);
    expect(exactScoreBonus).toBe(23); // round(1.5 * 15)
  });
});
