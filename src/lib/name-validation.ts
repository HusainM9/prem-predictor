/** Name validation for all named features: league names, display names.*/

import { Filter } from "bad-words";
import LeoProfanity from "leo-profanity";

/** Names that redirect to global leaderboard — cannot be used as league names. */
const RESERVED_LEAGUE_NAMES = new Set([
  "global",
  "global league",
  "global leaderboard",
]);

/** Single bad-words Filter instance for isProfane checks. */
const badWordsFilter = new Filter();

/**
 * Normalize a name for validation only: trim and collapse internal whitespace to a single space.
 * Used internally by validators so checks (profanity, length, reserved) are consistent. Does not
 * change what gets stored — APIs store the trimmed user input as the actual display/league name.
 */
export function normalizeName(name: string | null | undefined): string {
  const s = typeof name === "string" ? name : "";
  return s.trim().replace(/\s+/g, " ");
}

/** True if the name contains profanity checked with both leo-profanity and bad-words. */
export function containsProfanity(name: string): boolean {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  return LeoProfanity.check(normalized) || badWordsFilter.isProfane(normalized);
}

/** True if the name is a reserved "global" league name */
export function isReservedLeagueName(name: string | null | undefined): boolean {
  const n = normalizeName(name).toLowerCase();
  return RESERVED_LEAGUE_NAMES.has(n);
}

export type ValidateNameResult =
  | { valid: true }
  | { valid: false; error: string };

/** Validates a league name for creation. Cant be empty, reserved, or contain profanity */
export function validateLeagueName(name: string): ValidateNameResult {
  const normalized = normalizeName(name);
  if (!normalized) {
    return { valid: false, error: "League name is required" };
  }
  if (isReservedLeagueName(normalized)) {
    return {
      valid: false,
      error: "This name is reserved. Please choose a different league name.",
    };
  }
  if (containsProfanity(normalized)) {
    return {
      valid: false,
      error: "League name contains a word that isn't allowed. Please choose a different name.",
    };
  }
  return { valid: true };
}

/** Default max length for display names (used on leaderboard, etc.). */
export const DISPLAY_NAME_MAX_LENGTH = 16;

/** Validates a display name: not empty, within length, no profanity. */
export function validateDisplayName(
  name: string,
  maxLength: number = DISPLAY_NAME_MAX_LENGTH
): ValidateNameResult {
  const normalized = normalizeName(name);
  if (!normalized) {
    return { valid: false, error: "Display name is required" };
  }
  if (normalized.length > maxLength) {
    return {
      valid: false,
      error: `Display name must be at most ${maxLength} characters`,
    };
  }
  if (containsProfanity(normalized)) {
    return {
      valid: false,
      error: "Display name contains a word that isn't allowed. Please choose a different name.",
    };
  }
  return { valid: true };
}
