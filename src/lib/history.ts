/**
 * Sum total_points across all gameweeks from the by_gameweek API response shape.
 * Used by the history page to compute overall total.
 */
export function sumTotalPointsFromByGameweek(
  byGameweek: Record<string, { total_points: number }>
): number {
  return (Object.values(byGameweek) as { total_points: number }[]).reduce(
    (s, g) => s + g.total_points,
    0
  );
}
