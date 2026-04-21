const HOUR_MS = 60 * 60 * 1000;

/**
 * How long chat messages are kept in the database and returned by the API.
 * Set `CHAT_MESSAGE_RETENTION_HOURS` (e.g. `1` for one hour) in the server environment.
 */
export function getChatMessageRetentionMs(): number {
  const raw = process.env.CHAT_MESSAGE_RETENTION_HOURS;
  if (raw != null && String(raw).trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      return Math.trunc(n * HOUR_MS);
    }
  }
  return HOUR_MS;
}

/** ISO timestamp: messages with `created_at` before this are excluded from reads and pruned by cleanup. */
export function getChatMessagesNotBeforeIso(): string {
  return new Date(Date.now() - getChatMessageRetentionMs()).toISOString();
}
