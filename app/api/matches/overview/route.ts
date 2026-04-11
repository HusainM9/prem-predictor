import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SEASON = "2025/26";
const HOURS_AFTER_LAST_MATCH_BEFORE_NEXT_GW = 24;
const MATCH_END_OFFSET_MS = 2 * 60 * 60 * 1000;

type Fixture = {
  id: string;
  kickoff_time: string;
  home_team: string;
  away_team: string;
  status: string;
  gameweek: number;
  home_goals: number | null;
  away_goals: number | null;
  is_stuck?: boolean;
};

/** Hide from Scoreline list: postponed/cancelled, invalid kickoff, or TBD 00:00:00 UTC (any non-finished status). */
function shouldHideFromMatchesOverview(f: { kickoff_time: string; status: string }): boolean {
  const s = (f.status ?? "").toLowerCase();
  if (s === "postponed" || s === "cancelled" || s === "canceled") return true;

  const d = new Date(f.kickoff_time);
  if (!Number.isFinite(d.getTime())) return true;

  const isMidnightUtc =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  const finished = s === "finished" || s === "ft";
  // Provider placeholder date; do not show as live (e.g. stale in_play) or upcoming.
  if (isMidnightUtc && !finished) return true;

  return false;
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
    const targetGwParam = searchParams.get("targetGw");
    const targetGw =
      targetGwParam != null && Number.isInteger(Number(targetGwParam)) && Number(targetGwParam) >= 1
        ? Number(targetGwParam)
        : null;

    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const [nextRowRes, minRowRes] = await Promise.all([
      supabase
        .from("fixtures")
        .select("gameweek")
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
        .order("gameweek", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    let nextGw = nextRowRes.data?.gameweek ?? null;
    if (nextGw == null) {
      const { data: lastRow } = await supabase
        .from("fixtures")
        .select("gameweek")
        .eq("season", SEASON)
        .order("gameweek", { ascending: false })
        .limit(1)
        .maybeSingle();
      nextGw = lastRow?.gameweek ?? 1;
    }

    let computedCurrentGw = nextGw;
    const prevGw = nextGw - 1;
    if (prevGw >= 1) {
      const { data: lastMatchPrevGw } = await supabase
        .from("fixtures")
        .select("kickoff_time, status")
        .eq("season", SEASON)
        .eq("gameweek", prevGw)
        .order("kickoff_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastMatchPrevGw) {
        const lastKickoffMs = new Date(lastMatchPrevGw.kickoff_time).getTime();
        const lastStatus = (lastMatchPrevGw.status ?? "").toLowerCase();
        const lastMatchEndedMs = lastKickoffMs + MATCH_END_OFFSET_MS;
        const cutoffMs = lastMatchEndedMs + HOURS_AFTER_LAST_MATCH_BEFORE_NEXT_GW * 60 * 60 * 1000;
        if (lastStatus !== "finished" || nowMs < cutoffMs) {
          computedCurrentGw = prevGw;
        }
      }
    }

    const minGwInDb = minRowRes.data?.gameweek ?? 1;
    const viewingGw =
      targetGw != null
        ? Math.min(computedCurrentGw, Math.max(minGwInDb, targetGw))
        : computedCurrentGw;

    const { data: gwFx, error: gwErr } = await supabase
      .from("fixtures")
      .select("id,kickoff_time,home_team,away_team,status,gameweek,home_goals,away_goals,is_stuck")
      .eq("season", SEASON)
      .eq("gameweek", viewingGw)
      .order("kickoff_time", { ascending: true });
    if (gwErr) {
      return NextResponse.json({ error: gwErr.message }, { status: 500 });
    }

    const gwList = ((gwFx ?? []) as Fixture[]).slice();
    gwList.sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time));
    const firstKickoff = gwList.length > 0 ? gwList[0].kickoff_time : null;

    let extraList: Fixture[] = [];
    if (firstKickoff) {
      const { data: extraFx } = await supabase
        .from("fixtures")
        .select("id,kickoff_time,home_team,away_team,status,gameweek,home_goals,away_goals,is_stuck")
        .eq("season", SEASON)
        .lt("kickoff_time", firstKickoff)
        .neq("status", "finished")
        .neq("status", "postponed")
        .neq("status", "cancelled")
        .neq("status", "canceled")
        .order("kickoff_time", { ascending: true });
      if (extraFx) extraList = (extraFx as Fixture[]).slice();
    }

    const seen = new Set(gwList.map((f) => f.id));
    const combined = [...gwList];
    for (const f of extraList) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        combined.push(f);
      }
    }
    combined.sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time));

    const visible = combined.filter((f) => !shouldHideFromMatchesOverview(f));

    return NextResponse.json({
      fixtures: visible,
      current_gameweek: computedCurrentGw,
      min_gameweek: minGwInDb,
      viewing_gameweek: viewingGw,
      updated_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

