const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CLOSE_MS = 24 * 60 * 60 * 1000;


export const GOTW_OUTLIER_DAYS_BEFORE_MEDIAN = 5;

export function getGotwAnchorKickoffMs(kickoffTimesIso: string[]): number | null {
  const ms = kickoffTimesIso
    .map((s) => new Date(s).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (ms.length === 0) return null;
  if (ms.length === 1) return ms[0];

  const medianMs = ms[Math.floor(ms.length / 2)];
  const threshold = medianMs - GOTW_OUTLIER_DAYS_BEFORE_MEDIAN * MS_PER_DAY;
  const eligible = ms.filter((t) => t >= threshold);
  const chosen = eligible.length > 0 ? eligible : ms;
  return chosen[0];
}

export function getGotwVoteCloseMs(kickoffTimesIso: string[]): number | null {
  const anchor = getGotwAnchorKickoffMs(kickoffTimesIso);
  if (anchor == null) return null;
  return anchor - CLOSE_MS;
}

export function getGotwAnchorKickoffIso(kickoffTimesIso: string[]): string | null {
  const anchor = getGotwAnchorKickoffMs(kickoffTimesIso);
  if (anchor == null) return null;
  return new Date(anchor).toISOString();
}
