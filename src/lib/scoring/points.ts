/**
 * Scoring for a single prediction once the fixture result is known.
 * - Correct result (H/D/A): points_awarded = round(stake × locked_odds − stake).
 * - When locked_odds is missing or invalid, fallback_odds (e.g. last snapshot of current odds) is used if provided; otherwise default 2.0.
 * - Exact score bonus: 1.5× that amount, only when both result and exact score are correct.
 */

/** Default odds used when locked_odds was never set (e.g. lock-odds job didn't run). Correct result then gets stake × 2 − stake = +10. */
const DEFAULT_LOCKED_ODDS = 2;

export interface ScorePredictionOptions {
  /** When prediction.locked_odds is null, use this (e.g. fixture odds_home_current / odds_draw_current / odds_away_current for the pick). */
  fallbackOdds?: number | null;
}

export type Pick = "H" | "D" | "A";

export interface PredictionRow {
  pick: Pick;
  stake: number;
  locked_odds: number | null;
  pred_home_goals: number;
  pred_away_goals: number;
}

export interface ActualResult {
  home_goals: number;
  away_goals: number;
}

export interface ScoredPrediction {
  points_awarded: number;
  bonus_exact_score_points: number;
  bonus_points: number;
}

/** Derive H/D/A from the actual full-time score. */
function actualPick(result: ActualResult): Pick {
  if (result.home_goals > result.away_goals) return "H";
  if (result.away_goals > result.home_goals) return "A";
  return "D";
}

/** Normalize DB pick value to H | D | A (handles "Home"/"Draw"/"Away" or H/D/A). */
function normalizePick(pick: string | null | undefined): Pick {
  if (!pick || typeof pick !== "string") return "D";
  const u = pick.trim().toLowerCase();
  if (u === "h" || u === "home") return "H";
  if (u === "a" || u === "away") return "A";
  if (u === "d" || u === "draw") return "D";
  return "D";
}

/**
 * Compute points for one prediction given the actual fixture result.
 * Correct result: profit on stake at locked odds. Exact score adds 1.5× that as bonus.
 * When locked_odds is null/invalid, uses options.fallbackOdds (e.g. last snapshot of current odds) then DEFAULT_LOCKED_ODDS.
 */
export function scorePrediction(
  prediction: PredictionRow,
  result: ActualResult,
  options?: ScorePredictionOptions
): ScoredPrediction {
  const actual = actualPick(result);
  const normalizedPick = normalizePick(prediction.pick as string);
  const correctResult = normalizedPick === actual;
  const exactScore =
    prediction.pred_home_goals === result.home_goals &&
    prediction.pred_away_goals === result.away_goals;

  const stake = prediction.stake ?? 10;
  const rawLocked = prediction.locked_odds != null && prediction.locked_odds > 0 ? prediction.locked_odds : null;
  const rawFallback = options?.fallbackOdds != null && options.fallbackOdds > 0 ? options.fallbackOdds : null;
  const lockedOdds = rawLocked ?? rawFallback ?? DEFAULT_LOCKED_ODDS;
  const resultPoints = correctResult ? stake * lockedOdds - stake : 0;
  const points_awarded = Math.round(resultPoints);

  const bonus_exact_score_points = exactScore && correctResult
    ? Math.round(1.5 * resultPoints)
    : 0;
  const bonus_points = bonus_exact_score_points;

  return {
    points_awarded,
    bonus_exact_score_points,
    bonus_points,
  };
}

/**
 * Potential points if correct result, and if exact score too.
 * Uses stake=10: result = 10×odds − 10, exact bonus = 1.5× that.
 */
export function potentialPoints(lockedOdds: number): {
  resultPoints: number;
  exactScoreBonus: number;
} {
  const resultPoints = Math.round(10 * lockedOdds - 10);
  const exactScoreBonus = Math.round(1.5 * (10 * lockedOdds - 10));
  return { resultPoints, exactScoreBonus };
}
