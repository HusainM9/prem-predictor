/** Default odds used when locked_odds was never set. Correct result then gets stake × 2 − stake = +10. */
const DEFAULT_LOCKED_ODDS = 2;

export interface ScorePredictionOptions {
  /** When prediction.locked_odds is null*/
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

/** Normalize DB pick value to H | D | A.*/
function normalizePick(pick: string | null | undefined): Pick {
  if (!pick || typeof pick !== "string") return "D";
  const u = pick.trim().toLowerCase();
  if (u === "h" || u === "home") return "H";
  if (u === "a" || u === "away") return "A";
  if (u === "d" || u === "draw") return "D";
  return "D";
}

/** Compute points for one prediction given the actual fixture result.*/
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

export function potentialPoints(lockedOdds: number): {
  resultPoints: number;
  exactScoreBonus: number;
} {
  const resultPoints = Math.round(10 * lockedOdds - 10);
  const exactScoreBonus = Math.round(1.5 * (10 * lockedOdds - 10));
  return { resultPoints, exactScoreBonus };
}
