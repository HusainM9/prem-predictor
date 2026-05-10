export const PREMIER_LEAGUE_TEAMS = [
  "Arsenal FC",
  "Aston Villa FC",
  "AFC Bournemouth",
  "Brentford FC",
  "Brighton & Hove Albion FC",
  "Burnley FC",
  "Chelsea FC",
  "Crystal Palace FC",
  "Everton FC",
  "Fulham FC",
  "Ipswich Town FC",
  "Leeds United FC",
  "Leicester City FC",
  "Liverpool FC",
  "Manchester City FC",
  "Manchester United FC",
  "Newcastle United FC",
  "Nottingham Forest FC",
  "Southampton FC",
  "Sunderland AFC",
  "Tottenham Hotspur FC",
  "West Ham United FC",
  "Wolverhampton Wanderers FC",
] as const;

export type FavouriteTeam = (typeof PREMIER_LEAGUE_TEAMS)[number];

const TEAM_SET = new Set<string>(PREMIER_LEAGUE_TEAMS);

export function isValidFavouriteTeam(value: string): value is FavouriteTeam {
  return TEAM_SET.has(value);
}

