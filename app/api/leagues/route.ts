import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateInviteCode } from "@/lib/leagues";
import { validateLeagueName } from "@/lib/name-validation";
import { aggregatePointsByUser, type PredictionRow } from "@/lib/leaderboard";

export type LeagueSummaryItem = {
  id: string;
  name: string;
  invite_code: string | null;
  member_count: number;
  my_rank: number | null;
  my_points: number | null;
  gap_to_first: number | null;
  /** Rank change vs previous gameweek: positive = moved up, negative = moved down */
  rank_change: number | null;
};

/**
 * Leagues the current user is a member of, ordered by joined_at.
 */
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
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: members, error: memErr } = await supabase
      .from("league_members")
      .select("league_id, joined_at")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true });

    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 500 });
    }

    const leagueIds = (members ?? []).map((m) => m.league_id);
    if (leagueIds.length === 0) {
      return NextResponse.json({ leagues: [] });
    }

    const { data: leagues, error: leagueErr } = await supabase
      .from("leagues")
      .select("id, name, invite_code")
      .in("id", leagueIds);

    if (leagueErr) {
      return NextResponse.json({ error: leagueErr.message }, { status: 500 });
    }

    const byId = new Map((leagues ?? []).map((l) => [l.id, l]));
    const ordered = leagueIds
      .map((id) => byId.get(id))
      .filter(Boolean) as { id: string; name: string; invite_code: string | null }[];

    // Global predictions (one prediction applies to all leagues)
    const { data: predRows, error: predErr } = await supabase
      .from("predictions")
      .select("user_id, points_awarded, bonus_exact_score_points, fixture_id")
      .not("settled_at", "is", null)
      .is("league_id", null);

    if (predErr) {
      return NextResponse.json({ error: predErr.message }, { status: 500 });
    }

    const allPreds = (predRows ?? []) as PredictionRow[];

    // Current gameweek = latest that has kicked off, previous = one before for weekly rank change
    const nowIso = new Date().toISOString();
    const { data: currentGwRow } = await supabase
      .from("fixtures")
      .select("gameweek")
      .eq("season", "2025/26")
      .lt("kickoff_time", nowIso)
      .order("kickoff_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    const currentGameweek = currentGwRow?.gameweek != null && Number.isInteger(currentGwRow.gameweek)
      ? currentGwRow.gameweek
      : 1;
    const previousGameweek = Math.max(1, currentGameweek - 1);

    let previousGwFixtureIds: Set<string> = new Set();
    if (previousGameweek < currentGameweek && allPreds.length > 0) {
      const { data: prevFixtures } = await supabase
        .from("fixtures")
        .select("id")
        .eq("season", "2025/26")
        .eq("gameweek", previousGameweek);
      previousGwFixtureIds = new Set((prevFixtures ?? []).map((f) => f.id));
    }

    // Per-league: member count, member ids, then filter preds and aggregate
    const { data: memberRows } = await supabase
      .from("league_members")
      .select("league_id, user_id")
      .in("league_id", leagueIds);

    const membersByLeague = new Map<string, Set<string>>();
    for (const m of memberRows ?? []) {
      const set = membersByLeague.get(m.league_id) ?? new Set();
      set.add(m.user_id);
      membersByLeague.set(m.league_id, set);
    }

    const result: LeagueSummaryItem[] = ordered.map((league) => {
      const memberIds = membersByLeague.get(league.id) ?? new Set();
      const memberCount = memberIds.size;
      const filtered = allPreds.filter((r) => memberIds.has(r.user_id));
      const sorted = aggregatePointsByUser(filtered);
      const myIndex = sorted.findIndex((e) => e.user_id === user.id);
      const myRank = myIndex >= 0 ? myIndex + 1 : null;
      const myPoints = myIndex >= 0 ? sorted[myIndex].total_points : null;
      const firstPoints = sorted.length > 0 ? sorted[0].total_points : 0;
      const gapToFirst =
        myPoints != null && myRank != null && myRank > 1 ? firstPoints - myPoints : null;

      let rankChange: number | null = null;
      if (previousGwFixtureIds.size > 0 && myRank != null) {
        const prevFiltered = allPreds.filter(
          (r) => memberIds.has(r.user_id) && previousGwFixtureIds.has(r.fixture_id)
        );
        const prevSorted = aggregatePointsByUser(prevFiltered);
        const prevIndex = prevSorted.findIndex((e) => e.user_id === user.id);
        const previousRank = prevIndex >= 0 ? prevIndex + 1 : null;
        if (previousRank != null) {
          rankChange = previousRank - myRank;
        }
      }

      return {
        id: league.id,
        name: league.name,
        invite_code: league.invite_code ?? null,
        member_count: memberCount,
        my_rank: myRank,
        my_points: myPoints,
        gap_to_first: gapToFirst,
        rank_change: rankChange,
      };
    });

    return NextResponse.json({ leagues: result });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * Create a private league with a 6-char invite code, caller becomes owner.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseAuth = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const rawName = typeof body.name === "string" ? body.name : "";
    const name = rawName.trim();
    const validation = validateLeagueName(name);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    let inviteCode = generateInviteCode();
    for (let attempt = 0; attempt < 20; attempt++) {
      const { data: existing } = await supabase
        .from("leagues")
        .select("id")
        .eq("invite_code", inviteCode)
        .maybeSingle();
      if (!existing) break;
      inviteCode = generateInviteCode();
    }

    const { data: league, error: leagueErr } = await supabase
      .from("leagues")
      .insert({
        name,
        invite_code: inviteCode,
        owner_id: user.id,
      })
      .select("id, name, invite_code")
      .single();

    if (leagueErr) {
      return NextResponse.json({ error: leagueErr.message }, { status: 500 });
    }

    const { error: memberErr } = await supabase.from("league_members").insert({
      league_id: league.id,
      user_id: user.id,
      role: "owner",
    });

    if (memberErr) {
      return NextResponse.json({ error: "League created but failed to add owner: " + memberErr.message }, { status: 500 });
    }

    return NextResponse.json({
      id: league.id,
      name: league.name,
      invite_code: league.invite_code,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
