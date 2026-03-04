/**
 * Short display names and 3-letter abbreviations for teams.
 * Level 1: short name (e.g. Wolves). Level 2: 3-letter abbreviation (e.g. WOL). Level 3: badge only.
 */

const SHORT_NAMES: Record<string, string> = {
  "Wolverhampton Wanderers FC": "Wolves",
  "Wolverhampton Wanderers": "Wolves",
  "West Ham United FC": "West Ham",
  "West Ham United": "West Ham",
  "Manchester United FC": "Man United",
  "Manchester United": "Man United",
  "Manchester City FC": "Man City",
  "Manchester City": "Man City",
  "Newcastle United FC": "Newcastle",
  "Newcastle United": "Newcastle",
  "Nottingham Forest FC": "Forest",
  "Nottingham Forest": "Forest",
  "Tottenham Hotspur FC": "Spurs",
  "Tottenham Hotspur": "Spurs",
  "Brighton & Hove Albion FC": "Brighton",
  "Brighton and Hove Albion FC": "Brighton",
  "Brighton & Hove Albion": "Brighton",
  "Brighton and Hove Albion": "Brighton",
  "Brighton Hove": "Brighton",
  "AFC Bournemouth": "Bournemouth",
  "Bournemouth": "Bournemouth",
  "Leicester City FC": "Leicester",
  "Leicester City": "Leicester",
  "Aston Villa FC": "Aston Villa",
  "Aston Villa": "Aston Villa",
  "Crystal Palace FC": "Crystal Palace",
  "Crystal Palace": "Crystal Palace",
  "Everton FC": "Everton",
  "Everton": "Everton",
  "Fulham FC": "Fulham",
  "Fulham": "Fulham",
  "Chelsea FC": "Chelsea",
  "Chelsea": "Chelsea",
  "Arsenal FC": "Arsenal",
  "Arsenal": "Arsenal",
  "Liverpool FC": "Liverpool",
  "Liverpool": "Liverpool",
  "Brentford FC": "Brentford",
  "Brentford": "Brentford",
  "Leeds United FC": "Leeds",
  "Leeds United": "Leeds",
  "Southampton FC": "Southampton",
  "Southampton": "Southampton",
  "West Bromwich Albion FC": "West Brom",
  "West Bromwich Albion": "West Brom",
  "Burnley FC": "Burnley",
  "Burnley": "Burnley",
  "Sheffield United FC": "Sheffield Utd",
  "Sheffield United": "Sheffield Utd",
  "Ipswich Town FC": "Ipswich",
  "Ipswich Town": "Ipswich",
  "Sunderland AFC": "Sunderland",
  "Sunderland": "Sunderland",
};

const ABBREVIATIONS: Record<string, string> = {
  "Wolverhampton Wanderers FC": "WOL",
  "Wolverhampton Wanderers": "WOL",
  "West Ham United FC": "WHU",
  "West Ham United": "WHU",
  "Manchester United FC": "MUN",
  "Manchester United": "MUN",
  "Manchester City FC": "MCI",
  "Manchester City": "MCI",
  "Newcastle United FC": "NEW",
  "Newcastle United": "NEW",
  "Nottingham Forest FC": "NFO",
  "Nottingham Forest": "NFO",
  "Tottenham Hotspur FC": "TOT",
  "Tottenham Hotspur": "TOT",
  "Brighton & Hove Albion FC": "BHA",
  "Brighton and Hove Albion FC": "BHA",
  "Brighton & Hove Albion": "BHA",
  "Brighton and Hove Albion": "BHA",
  "Brighton Hove": "BHA",
  "AFC Bournemouth": "BOU",
  "Bournemouth": "BOU",
  "Leicester City FC": "LEI",
  "Leicester City": "LEI",
  "Aston Villa FC": "AVL",
  "Aston Villa": "AVL",
  "Crystal Palace FC": "CRY",
  "Crystal Palace": "CRY",
  "Everton FC": "EVE",
  "Everton": "EVE",
  "Fulham FC": "FUL",
  "Fulham": "FUL",
  "Chelsea FC": "CHE",
  "Chelsea": "CHE",
  "Arsenal FC": "ARS",
  "Arsenal": "ARS",
  "Liverpool FC": "LIV",
  "Liverpool": "LIV",
  "Brentford FC": "BRE",
  "Brentford": "BRE",
  "Leeds United FC": "LEE",
  "Leeds United": "LEE",
  "Southampton FC": "SOU",
  "Southampton": "SOU",
  "West Bromwich Albion FC": "WBA",
  "West Bromwich Albion": "WBA",
  "Burnley FC": "BUR",
  "Burnley": "BUR",
  "Sheffield United FC": "SHU",
  "Sheffield United": "SHU",
  "Ipswich Town FC": "IPS",
  "Ipswich Town": "IPS",
  "Sunderland AFC": "SUN",
  "Sunderland": "SUN",
};

function toAbbreviationFallback(name: string): string {
  const words = name.trim().replace(/\s+/g, " ").split(" ");
  if (words.length >= 3) {
    return (words[0][0] + words[1][0] + words[2][0]).toUpperCase().slice(0, 3);
  }
  if (words.length === 2) {
    return (words[0].slice(0, 2) + words[1][0]).toUpperCase().slice(0, 3);
  }
  return name.slice(0, 3).toUpperCase();
}

export function getShortName(teamName: string): string {
  const key = teamName.trim();
  return SHORT_NAMES[key] ?? key;
}

export function getAbbreviation(teamName: string): string {
  const key = teamName.trim();
  return ABBREVIATIONS[key] ?? toAbbreviationFallback(key);
}
