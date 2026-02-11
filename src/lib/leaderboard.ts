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
