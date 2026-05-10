/**
 * Whether a viewer may see another user's predicted score before odds lock / kickoff.
 * After kickoff or after odds are locked, predictions are always visible to others.
 */
export function canRevealPredictionToViewer(params: {
  isOwner: boolean;
  predictionsPublicBeforeLock: boolean;
  kickoffTimeIso: string;
  oddsLockedAt: string | null;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  if (new Date(params.kickoffTimeIso) <= now) return true;
  if (params.oddsLockedAt) return true;
  if (params.isOwner) return true;
  return params.predictionsPublicBeforeLock === true;
}
