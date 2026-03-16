import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { aggregatePointsByUser, type PredictionRow } from "@/lib/leaderboard";

const SEASON = "2025/26";
const MAX_LEAGUE_TABS = 5;

type DashboardEntry = {
  rank: number;
  name: string;
  initials: string;
  points: number;
  change: number;
  isCurrentUser?: boolean;
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseAuth = createClient(supabaseUrl, anonKey);
    const {
      data: { user },
      error: authErr,
    } = await supabaseAuth.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const globalLeagueId = process.env.GLOBAL_LEAGUE_ID ?? process.env.NEXT_PUBLIC_GLOBAL_LEAGUE_ID ?? null;
    if (globalLeagueId) {
      const { data: existingGlobal } = await supabase
        .from("league_members")
        .select("user_id")
        .eq("league_id", globalLeagueId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!existingGlobal) {
        await supabase.from("league_members").insert({
          league_id: globalLeagueId,
          user_id: user.id,
          role: "member",
        });
      }
    }

    const nowIso = new Date().toISOString();
    const [nextRowRes, currentStartedRes, membersRes, upcomingRes] = await Promise.all([
      supabase
        .from("fixtures")
        .select("kickoff_time, gameweek")
        .eq("season", SEASON)
        .eq("status", "scheduled")
        .gte("kickoff_time", nowIso)
        .order("kickoff_time", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("fixtures")
        .select("gameweek")
        .eq("season", SEASON)
        .lt("kickoff_time", nowIso)
        .order("kickoff_time", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("league_members")
        .select("league_id, joined_at")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true }),
      supabase
        .from("fixtures")
        .select("id, kickoff_time, home_team, away_team")
        .eq("season", SEASON)
        .eq("status", "scheduled")
        .gte("kickoff_time", nowIso)
        .order("kickoff_time", { ascending: true })
        .limit(3),
    ]);

    if (membersRes.error) {
      return NextResponse.json({ error: membersRes.error.message }, { status: 500 });
    }

    const leagueIdsOrdered = (membersRes.data ?? []).map((m) => m.league_id);
    if (leagueIdsOrdered.length === 0) {
      return NextResponse.json({
        user_id: user.id,
        next_kickoff: nextRowRes.data?.kickoff_time ?? null,
        current_gameweek: (nextRowRes.data?.gameweek as number | null) ?? null,
        leagues: [],
        league_leaderboards: {},
        rank: null,
        points: null,
        last_gw_change: null,
        upcoming_fixtures: [],
      });
    }

    const displayLeagueIds = leagueIdsOrdered.slice(0, MAX_LEAGUE_TABS);

    const [leagueRowsRes, leagueMembersRes, predictionsRes, profilesRes, upcomingPredRes] = await Promise.all([
      supabase.from("leagues").select("id, name").in("id", displayLeagueIds),
      supabase.from("league_members").select("league_id, user_id").in("league_id", displayLeagueIds),
      supabase
        .from("predictions")
        .select("user_id, points_awarded, bonus_exact_score_points, fixture_id")
        .not("settled_at", "is", null)
        .is("league_id", null),
      supabase.from("profiles").select("id, display_name"),
      upcomingRes.data && upcomingRes.data.length > 0
        ? supabase
            .from("predictions")
            .select("fixture_id, pred_home_goals, pred_away_goals")
            .eq("user_id", user.id)
            .in("fixture_id", upcomingRes.data.map((f) => f.id))
        : Promise.resolve({ data: [], error: null } as { data: Array<{ fixture_id: string; pred_home_goals: number | null; pred_away_goals: number | null }>; error: null }),
    ]);

    if (leagueRowsRes.error || leagueMembersRes.error || predictionsRes.error || profilesRes.error || upcomingPredRes.error) {
      return NextResponse.json(
        {
          error:
            leagueRowsRes.error?.message ??
            leagueMembersRes.error?.message ??
            predictionsRes.error?.message ??
            profilesRes.error?.message ??
            upcomingPredRes.error?.message ??
            "Failed loading dashboard data",
        },
        { status: 500 }
      );
    }

    const leagueById = new Map((leagueRowsRes.data ?? []).map((l) => [l.id, l]));
    const leagues = displayLeagueIds
      .map((id) => leagueById.get(id))
      .filter(Boolean)
      .map((l) => ({ id: l!.id as string, name: l!.name as string }));

    const membersByLeague = new Map<string, Set<string>>();
    const memberUserIds = new Set<string>();
    for (const m of leagueMembersRes.data ?? []) {
      const set = membersByLeague.get(m.league_id) ?? new Set<string>();
      set.add(m.user_id);
      membersByLeague.set(m.league_id, set);
      memberUserIds.add(m.user_id);
    }

    const settledRows = (predictionsRes.data ?? []).filter((r) => memberUserIds.has(r.user_id)) as PredictionRow[];
    const userIdsForBonuses = [...memberUserIds];
    const { data: bonusRows } = userIdsForBonuses.length
      ? await supabase.from("user_gameweek_bonuses").select("user_id, gameweek, points").in("user_id", userIdsForBonuses)
      : { data: [] as Array<{ user_id: string; gameweek: number; points: number }> };

    const bonusTotalByUser = new Map<string, number>();
    const bonusByUserByGw = new Map<string, Map<number, number>>();
    for (const b of bonusRows ?? []) {
      const uid = b.user_id as string;
      const points = b.points ?? 0;
      const gw = b.gameweek as number;
      bonusTotalByUser.set(uid, (bonusTotalByUser.get(uid) ?? 0) + points);
      const byGw = bonusByUserByGw.get(uid) ?? new Map<number, number>();
      byGw.set(gw, (byGw.get(gw) ?? 0) + points);
      bonusByUserByGw.set(uid, byGw);
    }

    const nameByUser = new Map<string, string>(
      (profilesRes.data ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? "Player"])
    );

    const leagueLeaderboards: Record<string, DashboardEntry[]> = {};
    let myRank: number | null = null;
    let myPoints: number | null = null;
    let lastGwChange: number | null = null;

    const currentGameweek = (nextRowRes.data?.gameweek as number | null) ?? null;
    const startedGameweek = (currentStartedRes.data?.gameweek as number | null) ?? null;

    let gwCurrentFixtureIds = new Set<string>();
    let gwPreviousFixtureIds = new Set<string>();
    if (startedGameweek != null && startedGameweek >= 1) {
      const previousGameweek = Math.max(1, startedGameweek - 1);
      const { data: gwFixtures } = await supabase
        .from("fixtures")
        .select("id, gameweek")
        .eq("season", SEASON)
        .in("gameweek", [startedGameweek, previousGameweek]);
      gwCurrentFixtureIds = new Set((gwFixtures ?? []).filter((f) => f.gameweek === startedGameweek).map((f) => f.id));
      gwPreviousFixtureIds = new Set((gwFixtures ?? []).filter((f) => f.gameweek === previousGameweek).map((f) => f.id));
    }

    for (const league of leagues) {
      const memberIds = membersByLeague.get(league.id) ?? new Set<string>();
      const filtered = settledRows.filter((r) => memberIds.has(r.user_id));
      let sorted = aggregatePointsByUser(filtered)
        .map((e) => ({ ...e, total_points: e.total_points + (bonusTotalByUser.get(e.user_id) ?? 0) }))
        .sort((a, b) => {
          if (b.total_points !== a.total_points) return b.total_points - a.total_points;
          if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
          return b.correct_scores - a.correct_scores;
        });

      const entries: DashboardEntry[] = sorted.slice(0, 10).map((e, i) => {
        const name = nameByUser.get(e.user_id) ?? "Player";
        return {
          rank: i + 1,
          name,
          initials: initials(name),
          points: e.total_points,
          change: 0,
          isCurrentUser: e.user_id === user.id,
        };
      });
      leagueLeaderboards[league.id] = entries;

      if (leagues[0]?.id === league.id) {
        const myIndex = sorted.findIndex((e) => e.user_id === user.id);
        myRank = myIndex >= 0 ? myIndex + 1 : null;
        myPoints = myIndex >= 0 ? sorted[myIndex].total_points : null;

        if (startedGameweek != null && startedGameweek >= 2 && gwCurrentFixtureIds.size > 0 && gwPreviousFixtureIds.size > 0) {
          const aggregateByGw = (fixtureIds: Set<string>, gw: number) => {
            const agg = aggregatePointsByUser(
              filtered.filter((r) => fixtureIds.has(r.fixture_id))
            ).map((e) => ({
              ...e,
              total_points: e.total_points + (bonusByUserByGw.get(e.user_id)?.get(gw) ?? 0),
            }));
            return agg.sort((a, b) => {
              if (b.total_points !== a.total_points) return b.total_points - a.total_points;
              if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
              return b.correct_scores - a.correct_scores;
            });
          };
          const currentSorted = aggregateByGw(gwCurrentFixtureIds, startedGameweek);
          const previousSorted = aggregateByGw(gwPreviousFixtureIds, startedGameweek - 1);
          const curIdx = currentSorted.findIndex((e) => e.user_id === user.id);
          const prevIdx = previousSorted.findIndex((e) => e.user_id === user.id);
          if (curIdx >= 0 && prevIdx >= 0) {
            lastGwChange = (prevIdx + 1) - (curIdx + 1);
          }
        }
      }
    }

    const predByFixture = new Map<string, { home: number; away: number }>();
    for (const p of upcomingPredRes.data ?? []) {
      if (p.pred_home_goals != null && p.pred_away_goals != null) {
        predByFixture.set(p.fixture_id, { home: p.pred_home_goals, away: p.pred_away_goals });
      }
    }
    const upcomingFixtures = (upcomingRes.data ?? []).map((f) => {
      const pred = predByFixture.get(f.id);
      return {
        homeTeam: { name: f.home_team, shortName: f.home_team.slice(0, 3).toUpperCase() },
        awayTeam: { name: f.away_team, shortName: f.away_team.slice(0, 3).toUpperCase() },
        kickoff_time: f.kickoff_time,
        predicted: !!pred,
        prediction: pred ?? undefined,
      };
    });

    return NextResponse.json({
      user_id: user.id,
      next_kickoff: nextRowRes.data?.kickoff_time ?? null,
      current_gameweek: currentGameweek,
      leagues,
      league_leaderboards: leagueLeaderboards,
      rank: myRank,
      points: myPoints,
      last_gw_change: lastGwChange,
      upcoming_fixtures: upcomingFixtures,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

