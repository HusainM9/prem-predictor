import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TeamRecentMatch = {
  kickoff_time: string;
  team: string;
  opponent: string;
  goals_for: number;
  goals_against: number;
  result: "W" | "D" | "L";
};

type TeamForm = {
  team: string;
  last_five: TeamRecentMatch[];
};

type FixtureForm = {
  home_team: TeamForm;
  away_team: TeamForm;
};

type FixtureScoreRow = {
  kickoff_time: string;
  home_team: string;
  away_team: string;
  home_goals: number | null;
  away_goals: number | null;
  status: string;
};

function parseFixtureIds(param: string | null): string[] {
  if (!param) return [];
  return [...new Set(param.split(",").map((x) => x.trim()).filter((x) => UUID_REGEX.test(x)))];
}

async function getRecentMatchesForTeam(
  supabase: any,
  team: string,
  beforeKickoffIso: string
): Promise<TeamRecentMatch[]> {
  const { data } = await supabase
    .from("fixtures")
    .select("kickoff_time,home_team,away_team,home_goals,away_goals,status")
    .or(`home_team.eq.${team},away_team.eq.${team}`)
    .lt("kickoff_time", beforeKickoffIso)
    .eq("status", "finished")
    .order("kickoff_time", { ascending: false })
    .limit(15);

  const rows = ((data ?? []) as FixtureScoreRow[]).filter(
    (row): row is FixtureScoreRow & { home_goals: number; away_goals: number } =>
      row.home_goals != null &&
      row.away_goals != null &&
      Number.isInteger(Number(row.home_goals)) &&
      Number.isInteger(Number(row.away_goals))
  );

  const recent: TeamRecentMatch[] = [];
  for (const row of rows) {
    const homeGoals = Number(row.home_goals);
    const awayGoals = Number(row.away_goals);
    const isHome = row.home_team === team;
    const goalsFor = isHome ? homeGoals : awayGoals;
    const goalsAgainst = isHome ? awayGoals : homeGoals;
    const opponent = isHome ? row.away_team : row.home_team;
    const result: "W" | "D" | "L" =
      goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D";
    recent.push({
      kickoff_time: row.kickoff_time,
      team,
      opponent,
      goals_for: goalsFor,
      goals_against: goalsAgainst,
      result,
    });
    if (recent.length === 5) break;
  }
  return recent;
}

export async function GET(req: Request) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const { searchParams } = new URL(req.url);
    const fixtureIds = parseFixtureIds(searchParams.get("fixtureIds"));
    if (fixtureIds.length === 0) {
      return NextResponse.json({ forms: {} });
    }

    const { data: fixtures, error } = await supabase
      .from("fixtures")
      .select("id,kickoff_time,home_team,away_team")
      .in("id", fixtureIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const formsEntries = await Promise.all(
      (fixtures ?? []).map(async (f) => {
        const [homeRecent, awayRecent] = await Promise.all([
          getRecentMatchesForTeam(supabase, f.home_team, f.kickoff_time),
          getRecentMatchesForTeam(supabase, f.away_team, f.kickoff_time),
        ]);
        const form: FixtureForm = {
          home_team: { team: f.home_team, last_five: homeRecent },
          away_team: { team: f.away_team, last_five: awayRecent },
        };
        return [f.id, form] as const;
      })
    );

    return NextResponse.json({ forms: Object.fromEntries(formsEntries) });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

