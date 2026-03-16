"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { potentialPoints } from "@/lib/scoring/points";
import { TeamDisplay } from "@/components/TeamDisplay";
import { ScoringInfo } from "@/components/ScoringInfo";
import { VoteForMatchOfTheWeek } from "@/components/VoteForMatchOfTheWeek";

type Pick = "H" | "D" | "A";

type FixtureRow = {
  id: string;
  kickoff_time: string;
  home_team: string;
  away_team: string;
  status: string;
  gameweek: number;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  odds_locked_at: string | null;
  odds_home_current: number | null;
  odds_draw_current: number | null;
  odds_away_current: number | null;
  odds_current_updated_at: string | null;
  odds_current_bookmaker: string | null;
};

function formatKickoff(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function kickoffGroupKey(iso: string): string {
  return formatKickoff(iso);
}

/** List upcoming fixtures for the next gameweek and any fixtures added to the play page. */
export default function PlayPage() {
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [gw, setGw] = useState<number | null>(null);

  const [homeGoals, setHomeGoals] = useState<Record<string, string>>({});
  const [awayGoals, setAwayGoals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [alreadySavedFixtureIds, setAlreadySavedFixtureIds] = useState<Set<string>>(new Set());
  /** Last saved score per fixture to show orange when current input differs. */
  const [lastSavedScores, setLastSavedScores] = useState<Record<string, { h: number; a: number }>>({});
  const [now, setNow] = useState(() => Date.now());
  const [settledPredictions, setSettledPredictions] = useState<
    Array<{
      fixture: { home_team: string; away_team: string; home_goals: number | null; away_goals: number | null };
      pred_home_goals: number;
      pred_away_goals: number;
      points_awarded: number;
      bonus_points: number;
      total_points: number;
    }>
  >([]);
  /** 0 = current gameweek settled, 1 = previous gameweek. */
  const [settledGameweekOffset, setSettledGameweekOffset] = useState(0);
  /** Fixture id that won the last game-of-the-week vote . */
  const [matchOfTheWeekFixtureId, setMatchOfTheWeekFixtureId] = useState<string | null>(null);

  /** Convert predicted score to outcome. H = home win, A = away win, D = draw. */
  function derivedPick(hg: number, ag: number): Pick | null {
    if (hg > ag) return "H";
    if (ag > hg) return "A";
    return "D";
  }

  const totalFixtures = fixtures.length;
  const submittedCount = useMemo(
    () => fixtures.filter((f) => alreadySavedFixtureIds.has(f.id)).length,
    [fixtures, alreadySavedFixtureIds]
  );

  /** fixtures in order. Sorted by actual kickoff time */
  const groups = useMemo(() => {
    const map = new Map<string, FixtureRow[]>();
    for (const f of fixtures) {
      const key = kickoffGroupKey(f.kickoff_time);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    const entries = Array.from(map.entries());
    entries.sort(([, listA], [, listB]) => {
      const timeA = listA[0]?.kickoff_time ?? "";
      const timeB = listB[0]?.kickoff_time ?? "";
      return timeA.localeCompare(timeB);
    });
    return entries.map(([label, list]) => {
      const sorted = [...list].sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time));
      return [label, sorted] as [string, FixtureRow[]];
    });
  }, [fixtures]);

  const scoreInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /** Countdown to first kickoff */
  const countdown = useMemo(() => {
    if (fixtures.length === 0) return null;
    const first = new Date(fixtures[0].kickoff_time).getTime();
    const diff = Math.max(0, first - now);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [fixtures, now]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr(null);

      const nowIso = new Date().toISOString();
      const sessionPromise = supabase.auth.getSession();

      const { data: gwRow, error: gwErr } = await supabase
        .from("fixtures")
        .select("gameweek")
        .eq("season", "2025/26")
        .eq("status", "scheduled")
        .gte("kickoff_time", nowIso)
        .or("include_on_play_page.is.null,include_on_play_page.eq.false")
        .order("kickoff_time", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (gwErr) {
        setErr(gwErr.message);
        setFixtures([]);
        setLoading(false);
        return;
      }

      const nextGw = gwRow?.gameweek ?? 1;
      setGw(nextGw);

      const selectCols =
        "id,kickoff_time,home_team,away_team,status,gameweek,odds_home,odds_draw,odds_away,odds_locked_at,odds_home_current,odds_draw_current,odds_away_current,odds_current_updated_at,odds_current_bookmaker";

      const { data: gwFx, error: gwErr2 } = await supabase
        .from("fixtures")
        .select(selectCols)
        .eq("season", "2025/26")
        .eq("gameweek", nextGw)
        .eq("status", "scheduled")
        .gte("kickoff_time", nowIso)
        .order("kickoff_time", { ascending: true });

      if (gwErr2) {
        setErr(gwErr2.message);
        setFixtures([]);
        setLoading(false);
        return;
      }

      const gwList = ((gwFx ?? []) as FixtureRow[]).slice();
      gwList.sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time));

      let extraList: FixtureRow[] = [];
      const { data: extraFx } = await supabase
        .from("fixtures")
        .select(selectCols)
        .eq("season", "2025/26")
        .eq("status", "scheduled")
        .eq("include_on_play_page", true)
        .gte("kickoff_time", nowIso)
        .order("kickoff_time", { ascending: true });
      if (extraFx) extraList = (extraFx as FixtureRow[]).slice();

      const seen = new Set(gwList.map((f) => f.id));
      const combined = [...gwList];
      for (const f of extraList) {
        if (!seen.has(f.id)) {
          seen.add(f.id);
          combined.push(f);
        }
      }
      combined.sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time));
      setFixtures(combined);
      setLoading(false);

      const { data: { session } } = await sessionPromise;
      if (session?.access_token && combined.length > 0) {
        const fixtureIds = combined.map((f) => f.id).join(",");
        try {
          const res = await fetch(
            `/api/predictions/for-fixtures?fixtureIds=${encodeURIComponent(fixtureIds)}`,
            { headers: { Authorization: `Bearer ${session.access_token}` } }
          );
          const data = await res.json();
          if (res.ok && Array.isArray(data.predictions)) {
            const home: Record<string, string> = {};
            const away: Record<string, string> = {};
            const savedIds = new Set<string>();
            const savedScores: Record<string, { h: number; a: number }> = {};
            for (const p of data.predictions) {
              if (p.fixture_id != null && (p.pred_home_goals != null || p.pred_away_goals != null)) {
                const h = Number(p.pred_home_goals ?? 0);
                const a = Number(p.pred_away_goals ?? 0);
                home[p.fixture_id] = String(p.pred_home_goals ?? "");
                away[p.fixture_id] = String(p.pred_away_goals ?? "");
                savedIds.add(p.fixture_id);
                savedScores[p.fixture_id] = { h, a };
              }
            }
            if (Object.keys(home).length > 0) setHomeGoals((prev) => ({ ...prev, ...home }));
            if (Object.keys(away).length > 0) setAwayGoals((prev) => ({ ...prev, ...away }));
            if (savedIds.size > 0) setAlreadySavedFixtureIds(savedIds);
            if (Object.keys(savedScores).length > 0) setLastSavedScores((prev) => ({ ...prev, ...savedScores }));
          }
        } catch {
        }
      }
    }

    load();
  }, []);

  // Load settled results for selected gameweek 
  const settledGameweek = gw != null ? Math.max(1, gw - settledGameweekOffset) : null;
  useEffect(() => {
    if (gw == null || settledGameweek == null) {
      setSettledPredictions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setSettledPredictions([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/predictions/history?gameweek=${settledGameweek}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        const data = await res.json();
        if (cancelled || !res.ok) return;
        const list = Array.isArray(data.predictions) ? data.predictions : [];
        const settled = list.filter(
          (p: { fixture?: { home_goals?: number | null; away_goals?: number | null } }) =>
            p.fixture != null &&
            (p.fixture.home_goals != null || p.fixture.away_goals != null)
        );
        if (!cancelled) {
          setSettledPredictions(
            settled.map((p: {
              fixture: { home_team: string; away_team: string; home_goals: number | null; away_goals: number | null };
              pred_home_goals: number;
              pred_away_goals: number;
              points_awarded?: number;
              bonus_points?: number;
              total_points?: number;
            }) => ({
              fixture: p.fixture,
              pred_home_goals: p.pred_home_goals,
              pred_away_goals: p.pred_away_goals,
              points_awarded: p.points_awarded ?? 0,
              bonus_points: p.bonus_points ?? 0,
              total_points: p.total_points ?? (p.points_awarded ?? 0) + (p.bonus_points ?? 0),
            }))
          );
        }
      } catch {
        if (!cancelled) setSettledPredictions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gw, settledGameweek]);

  function parseGoal(s: string | undefined): number {
    const t = (s ?? "").trim();
    return t === "" ? 0 : Number(t);
  }

  function validate(fixtureId: string) {
    const hg = parseGoal(homeGoals[fixtureId]);
    const ag = parseGoal(awayGoals[fixtureId]);
    if (!Number.isInteger(hg) || hg < 0) return "Home goals must be 0 or more.";
    if (!Number.isInteger(ag) || ag < 0) return "Away goals must be 0 or more.";
    return null;
  }

  async function savePrediction(fixture: FixtureRow) {
    setMsg((m) => ({ ...m, [fixture.id]: "" }));
    const validation = validate(fixture.id);
    if (validation) {
      setMsg((m) => ({ ...m, [fixture.id]: validation }));
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setMsg((m) => ({ ...m, [fixture.id]: "Log in to submit predictions." }));
      return;
    }

    setSaving((s) => ({ ...s, [fixture.id]: true }));

    const hg = parseGoal(homeGoals[fixture.id]);
    const ag = parseGoal(awayGoals[fixture.id]);
    const p = derivedPick(hg, ag)!;

    try {
      const res = await fetch("/api/predictions/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fixtureId: fixture.id,
          pick: p,
          predHomeGoals: hg,
          predAwayGoals: ag,
          leagueId: null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMsg((m) => ({ ...m, [fixture.id]: `Error: ${json.error ?? "Failed"}` }));
      } else {
        setMsg((m) => ({ ...m, [fixture.id]: "Saved" }));
        setAlreadySavedFixtureIds((prev) => new Set(prev).add(fixture.id));
        setLastSavedScores((prev) => ({ ...prev, [fixture.id]: { h: hg, a: ag } }));
      }
    } catch (e: unknown) {
      setMsg((m) => ({ ...m, [fixture.id]: `Error: ${String(e instanceof Error ? e.message : e)}` }));
    }

    setSaving((s) => ({ ...s, [fixture.id]: false }));
  }

  async function saveAll() {
    for (const f of fixtures) {
      const hgStr = homeGoals[f.id];
      const agStr = awayGoals[f.id];
      const hasInput = (hgStr ?? "") !== "" || (agStr ?? "") !== "";
      if (!hasInput || alreadySavedFixtureIds.has(f.id)) continue;
      if (validate(f.id)) continue;
      await savePrediction(f);
    }
  }

  const hasUnsaved = fixtures.some((f) => {
    const hg = (homeGoals[f.id] ?? "").trim();
    const ag = (awayGoals[f.id] ?? "").trim();
    return hg !== "" && ag !== "" && !alreadySavedFixtureIds.has(f.id);
  });

  const [scoringInfoPinned, setScoringInfoPinned] = useState(false);
  const [scoringInfoHover, setScoringInfoHover] = useState(false);
  const scoringInfoVisible = scoringInfoPinned || scoringInfoHover;
  const hoverLeaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHoverLeave = () => {
    if (hoverLeaveRef.current) {
      clearTimeout(hoverLeaveRef.current);
      hoverLeaveRef.current = null;
    }
  };
  const scheduleHoverLeave = () => {
    clearHoverLeave();
    hoverLeaveRef.current = setTimeout(() => setScoringInfoHover(false), 150);
  };
  useEffect(() => () => clearHoverLeave(), []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-3 py-4 pb-8 max-sm:px-3 max-sm:py-4 max-sm:pb-8 sm:px-4 sm:py-6 sm:pb-10 md:px-6">
            {}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <Link
                href="/"
                className="min-h-[44px] touch-manipulation text-muted-foreground hover:text-foreground inline-flex items-center transition-colors"
              >
                ← Dashboard
              </Link>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {totalFixtures > 0 ? `${submittedCount}/${totalFixtures} submitted` : "—"}
                </span>
                {countdown != null && (
                  <span className="flex items-center gap-1.5 text-sm font-mono text-foreground">
                    <span className="text-muted-foreground" aria-hidden>🕐</span>
                    {countdown}
                  </span>
                )}
              </div>
            </div>

            <div className="mb-6 sm:mb-8">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-primary max-sm:text-xl sm:text-2xl md:text-3xl">
                  {gw != null ? `GW${gw}` : "…"} Matchday Predictions
                </h1>
                <button
                  type="button"
                  onClick={() => setScoringInfoPinned((p) => !p)}
                  onMouseEnter={() => { clearHoverLeave(); setScoringInfoHover(true); }}
                  onMouseLeave={scheduleHoverLeave}
                  className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                  aria-label="How scoring works"
                  title="How scoring works"
                >
                  <Info className="size-5" />
                </button>
              </div>
              {scoringInfoVisible && (
                <div
                  className="mt-2 w-full"
                  onMouseEnter={() => { clearHoverLeave(); setScoringInfoHover(true); }}
                  onMouseLeave={scheduleHoverLeave}
                >
                  <ScoringInfo />
                </div>
              )}
            </div>

        {!loading && !err && (
          <div className="mb-6">
            <VoteForMatchOfTheWeek
              variant="full"
              onLastWinnerChange={setMatchOfTheWeekFixtureId}
            />
          </div>
        )}

        {loading && <p className="text-muted-foreground">Loading fixtures…</p>}
        {err && <p className="text-destructive">Error: {err}</p>}

        {!loading && !err && fixtures.length === 0 && (
          <p className="text-muted-foreground">No scheduled fixtures for this gameweek.</p>
        )}

        {!loading && !err && fixtures.length > 0 && (
          <div className="space-y-8">
            {groups.map(([groupLabel, groupFixtures]) => {
              const blockSubmitted = groupFixtures.filter((f) => alreadySavedFixtureIds.has(f.id)).length;
              const blockTotal = groupFixtures.length;
              return (
                <section key={groupLabel}>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      {groupLabel}
                    </h2>
                    <span className="text-sm text-muted-foreground">
                      {blockSubmitted}/{blockTotal}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {groupFixtures.map((f) => {
                      const isMatchOfTheWeek = matchOfTheWeekFixtureId === f.id;
                      const locked = !!f.odds_locked_at;
                      const oddsSource = locked
                        ? "locked"
                        : f.odds_home_current != null &&
                            f.odds_draw_current != null &&
                            f.odds_away_current != null
                          ? "current"
                          : "none";
                      const oddsH = locked ? f.odds_home : f.odds_home_current;
                      const oddsD = locked ? f.odds_draw : f.odds_draw_current;
                      const oddsA = locked ? f.odds_away : f.odds_away_current;

                      const hgStr = homeGoals[f.id];
                      const agStr = awayGoals[f.id];
                      const hasInput =
                        (hgStr ?? "").trim() !== "" && (agStr ?? "").trim() !== "";
                      const hg = parseGoal(hgStr);
                      const ag = parseGoal(agStr);
                      const valid =
                        Number.isInteger(hg) &&
                        hg >= 0 &&
                        Number.isInteger(ag) &&
                        ag >= 0;
                      const pick = valid ? derivedPick(hg, ag) : null;
                      const oddsForPick =
                        pick === "H" ? oddsH : pick === "D" ? oddsD : oddsA;
                      const { resultPoints, exactScoreBonus, wrongLoss } =
                        oddsForPick != null
                          ? potentialPoints(oddsForPick)
                          : { resultPoints: 0, exactScoreBonus: 0, wrongLoss: -10 };
                      const correctPointsWithGotw = isMatchOfTheWeek ? resultPoints + 15 : resultPoints;
                      const exactScoreBonusWithGotw = isMatchOfTheWeek ? exactScoreBonus + 15 : exactScoreBonus;

                      const saved = alreadySavedFixtureIds.has(f.id);
                      const lastSaved = lastSavedScores[f.id];
                      const currentMatchesSaved =
                        saved &&
                        lastSaved != null &&
                        hg === lastSaved.h &&
                        ag === lastSaved.a;
                      const hasUnsavedChanges = hasInput && !currentMatchesSaved;
                      const barColor = isMatchOfTheWeek
                        ? "border-l-primary bg-primary/5"
                        : currentMatchesSaved
                          ? "border-l-primary"
                          : hasUnsavedChanges
                            ? "border-l-warning"
                            : "border-l-transparent";

                      return (
                        <div
                          key={f.id}
                          className={`rounded-lg border border-border bg-card p-4 pl-5 border-l-4 ${barColor}`}
                        >
                          {/* Odds row: centered H / D / A pills + Locked vs Live */}
                          <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
                            {oddsH != null && oddsD != null && oddsA != null ? (
                              <>
                                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                                  H {oddsH.toFixed(2)}
                                </span>
                                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                                  D {oddsD.toFixed(2)}
                                </span>
                                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                                  A {oddsA.toFixed(2)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {locked ? "Locked" : oddsSource === "current" ? "● Live odds" : ""}
                                </span>
                                {isMatchOfTheWeek && (
                                  <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                                    Match of the week
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Odds not available yet
                              </span>
                            )}
                          </div>

                          {/* Teams + score inputs stacked = badge + short name below on play page */}
                          <div className="flex min-h-[4rem] flex-nowrap items-center justify-center gap-2 max-sm:min-h-[4rem] max-sm:gap-2 sm:gap-2.5 md:gap-3">
                            <div className="flex min-w-[64px] shrink items-center justify-end max-sm:min-w-[64px] sm:min-w-[72px]">
                              <TeamDisplay teamName={f.home_team} size={32} align="end" layout="abbr" />
                            </div>
                            <input
                              ref={(el) => {
                                scoreInputRefs.current[`${f.id}-home`] = el;
                              }}
                              value={homeGoals[f.id] ?? ""}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, "").slice(0, 2);
                                setHomeGoals((h) => ({ ...h, [f.id]: val }));
                                if (val.length === 1) {
                                  scoreInputRefs.current[`${f.id}-away`]?.focus();
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  savePrediction(f);
                                }
                              }}
                              inputMode="numeric"
                              placeholder="0"
                              aria-label="Home score"
                              className="h-10 w-10 shrink-0 touch-manipulation rounded-md border-2 border-primary bg-background/50 text-center text-base font-semibold text-foreground max-sm:h-10 max-sm:w-10 sm:h-11 sm:w-11 md:min-h-[44px] md:w-12 md:text-lg"
                            />
                            <span className="shrink-0 font-semibold text-muted-foreground max-sm:text-sm sm:text-base">VS</span>
                            <input
                              ref={(el) => {
                                scoreInputRefs.current[`${f.id}-away`] = el;
                              }}
                              value={awayGoals[f.id] ?? ""}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, "").slice(0, 2);
                                setAwayGoals((a) => ({ ...a, [f.id]: val }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  savePrediction(f);
                                }
                              }}
                              inputMode="numeric"
                              placeholder="0"
                              aria-label="Away score"
                              className="h-10 w-10 shrink-0 touch-manipulation rounded-md border-2 border-primary bg-background/50 text-center text-base font-semibold text-foreground max-sm:h-10 max-sm:w-10 sm:h-11 sm:w-11 md:min-h-[44px] md:w-12 md:text-lg"
                            />
                            <div className="flex min-w-[64px] shrink items-center justify-start max-sm:min-w-[64px] sm:min-w-[72px]">
                              <TeamDisplay teamName={f.away_team} size={32} align="start" layout="abbr" />
                            </div>
                          </div>

                          {/* Potential points */}
                          {valid && pick && oddsH != null && oddsD != null && oddsA != null && (
                            <p className="mt-2 text-center text-sm text-muted-foreground">
                              Correct: {correctPointsWithGotw} pts
                              {isMatchOfTheWeek ? " (GOTW Bonus +15)" : ""}
                              {" · "}Exact: +{exactScoreBonusWithGotw} · Wrong: {wrongLoss}
                              {valid && pick && ` · ${hg}–${ag} (${pick === "H" ? "Home" : pick === "A" ? "Away" : "Draw"})`}
                            </p>
                          )}

                          {/* Save button only. left bar is green when saved, orange when unsaved */}
                          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                            <button
                              type="button"
                              onClick={() => savePrediction(f)}
                              disabled={!!saving[f.id]}
                              className="min-h-[44px] min-w-[120px] touch-manipulation rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
                            >
                              {saving[f.id] ? "Saving…" : currentMatchesSaved ? "Update" : "Save"}
                            </button>
                            {msg[f.id] && (
                              <span
                                className={
                                  msg[f.id].startsWith("Error")
                                    ? "text-destructive text-sm"
                                    : "text-muted-foreground text-sm"
                                }
                              >
                                {msg[f.id]}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* Footer progress + Save All */}
        {!loading && !err && totalFixtures > 0 && (
          <footer className="mt-8 border-t border-border pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {submittedCount} of {totalFixtures} submitted
                </span>
                <div
                  className="h-2 w-24 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={submittedCount}
                  aria-valuemin={0}
                  aria-valuemax={totalFixtures}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${totalFixtures ? (100 * submittedCount) / totalFixtures : 0}%`,
                    }}
                  />
                </div>
              </div>
              {hasUnsaved && (
                <button
                  type="button"
                  onClick={saveAll}
                  className="min-h-[44px] touch-manipulation rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Save All
                </button>
              )}
            </div>
          </footer>
        )}

        {/* Settled results: current gameweek only by default, option to go back one */}
        {gw != null && (
          <section className="mt-10 border-t border-border pt-8" aria-label="Settled results">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Settled results
              </h2>
              <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
                <button
                  type="button"
                  onClick={() => setSettledGameweekOffset(0)}
                  className={`min-h-[40px] touch-manipulation rounded-md px-3 text-sm font-medium transition-colors ${
                    settledGameweekOffset === 0
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  GW{gw}
                </button>
                {gw > 1 && (
                  <button
                    type="button"
                    onClick={() => setSettledGameweekOffset(1)}
                    className={`min-h-[40px] touch-manipulation rounded-md px-3 text-sm font-medium transition-colors ${
                      settledGameweekOffset === 1
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    GW{gw - 1}
                  </button>
                )}
              </div>
            </div>
            {settledPredictions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {settledGameweek != null
                  ? `No settled predictions for GW${settledGameweek} yet.`
                  : "Log in to see your settled results."}
              </p>
            ) : (
              <ul className="space-y-3">
                {settledPredictions.map((p, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-border bg-card p-4 text-sm"
                  >
                    <p className="font-medium text-foreground">
                      {p.fixture.home_team} vs {p.fixture.away_team}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Your prediction: {p.pred_home_goals}–{p.pred_away_goals}
                    </p>
                    <p className="text-muted-foreground">
                      Result: {p.fixture.home_goals ?? "—"}–{p.fixture.away_goals ?? "—"}
                    </p>
                    <p className="mt-1 font-medium text-primary">
                      {p.total_points} pts
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
