/** Default number of messages per chat fetch (initial + each "load older" batch). */
export const CHAT_PAGE_SIZE = 25;

/** Minimum gap between two messages from the same user in the same channel. */
export const CHAT_SLOW_MODE_MS = 5000;

/**
 * Window in which a second identical text (or same prediction share) is rejected as duplicate.
 */
export const CHAT_DUPLICATE_WINDOW_MS = 60_000;

export function normalizeTextForDuplicateCheck(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * For prediction_share duplicates: compare by prediction_id in the stored server payload.
 */
export function getPredictionIdFromSharePayload(
  payload: unknown
): string | null {
  if (!payload || typeof payload !== "object") return null;
  const id = (payload as { prediction_id?: unknown }).prediction_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}
