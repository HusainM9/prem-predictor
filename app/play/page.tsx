"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { ScoringInfo } from "@/components/ScoringInfo";
import { VoteForMatchOfTheWeek } from "@/components/VoteForMatchOfTheWeek";
import { PlayMatchCard, type PlayFixtureRow, type PredictionMeta } from "@/components/play/PlayMatchCard";

type Pick = "H" | "D" | "A";

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
  const [fixtures, setFixtures] = useState<PlayFixtureRow[]>([]);
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
  const [predictionMeta, setPredictionMeta] = useState<Record<string, PredictionMeta>>({});
  const autoSavedLockRef = useRef<Set<string>>(new Set());
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
    const map = new Map<string, PlayFixtureRow[]>();
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
      return [label, sorted] as [string, PlayFixtureRow[]];
    });
  }, [fixtures]);

  /** Countdown to next upcoming kickoff in this list */
  const countdown = useMemo(() => {
    if (fixtures.length === 0) return null;
    const upcoming = fixtures.find((f) => new Date(f.kickoff_time).getTime() > now);
    if (!upcoming) return null;
    const t = new Date(upcoming.kickoff_time).getTime();
    const diff = Math.max(0, t - now);
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
        "id,kickoff_time,home_team,away_team,status,gameweek,home_goals,away_goals,odds_home,odds_draw,odds_away,odds_locked_at,odds_home_current,odds_draw_current,odds_away_current,odds_current_updated_at,odds_current_bookmaker";

      const { data: gwFx, error: gwErr2 } = await supabase
        .from("fixtures")
        .select(selectCols)
        .eq("season", "2025/26")
        .eq("gameweek", nextGw)
        .order("kickoff_time", { ascending: true });

      if (gwErr2) {
        setErr(gwErr2.message);
        setFixtures([]);
        setLoading(false);
        return;
      }

      const gwList = ((gwFx ?? []) as PlayFixtureRow[]).slice();
      gwList.sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time));

      let extraList: PlayFixtureRow[] = [];
      const { data: extraFx } = await supabase
        .from("fixtures")
        .select(selectCols)
        .eq("season", "2025/26")
        .eq("gameweek", nextGw)
        .eq("include_on_play_page", true)
        .order("kickoff_time", { ascending: true });
      if (extraFx) extraList = (extraFx as PlayFixtureRow[]).slice();

      const seen = new Set(gwList.map((f) => f.id));
      const combined = [...gwList];
      for (const f of extraList) {
        if (!seen.has(f.id)) {
          seen.add(f.id);
          combined.push(f);
        }
      }
      combined.sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time));
      let combinedWithForm = combined;
      if (combined.length > 0) {
        const fixtureIds = combined.map((f) => f.id).join(",");
        try {
          const formRes = await fetch(
            `/api/matches/form?fixtureIds=${encodeURIComponent(fixtureIds)}`
          );
          const formData = await formRes.json().catch(() => ({}));
          if (formRes.ok && formData.forms && typeof formData.forms === "object") {
            const forms = formData.forms as Record<string, PlayFixtureRow["form"]>;
            combinedWithForm = combined.map((f) => ({
              ...f,
              form: forms[f.id] ?? f.form,
            }));
          }
        } catch {
        }
      }
      setFixtures(combinedWithForm);
      setLoading(false);

      const { data: { session } } = await sessionPromise;
      if (session?.access_token && combinedWithForm.length > 0) {
        const fixtureIds = combinedWithForm.map((f) => f.id).join(",");
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
            const meta: Record<string, PredictionMeta> = {};
            for (const p of data.predictions) {
              if (p.fixture_id != null && (p.pred_home_goals != null || p.pred_away_goals != null)) {
                const h = Number(p.pred_home_goals ?? 0);
                const a = Number(p.pred_away_goals ?? 0);
                home[p.fixture_id] = String(p.pred_home_goals ?? "");
                away[p.fixture_id] = String(p.pred_away_goals ?? "");
                savedIds.add(p.fixture_id);
                savedScores[p.fixture_id] = { h, a };
              }
              if (p.fixture_id != null) {
                meta[p.fixture_id] = {
                  points_awarded: Number(p.points_awarded ?? 0),
                  bonus_exact_score_points: Number(p.bonus_exact_score_points ?? 0),
                  settled_at: typeof p.settled_at === "string" ? p.settled_at : null,
                };
              }
            }
            if (Object.keys(home).length > 0) setHomeGoals((prev) => ({ ...prev, ...home }));
            if (Object.keys(away).length > 0) setAwayGoals((prev) => ({ ...prev, ...away }));
            if (savedIds.size > 0) setAlreadySavedFixtureIds(savedIds);
            if (Object.keys(savedScores).length > 0) setLastSavedScores((prev) => ({ ...prev, ...savedScores }));
            if (Object.keys(meta).length > 0) setPredictionMeta((prev) => ({ ...prev, ...meta }));
          }
        } catch {
        }
      }
    }

    load();
  }, []);

  function parseGoal(s: string | undefined): number {
    const t = (s ?? "").trim();
    return t === "" ? 0 : Number(t);
  }

  const validate = useCallback((fixtureId: string) => {
    const hg = parseGoal(homeGoals[fixtureId]);
    const ag = parseGoal(awayGoals[fixtureId]);
    if (!Number.isInteger(hg) || hg < 0) return "Home goals must be 0 or more.";
    if (!Number.isInteger(ag) || ag < 0) return "Away goals must be 0 or more.";
    return null;
  }, [homeGoals, awayGoals]);

  const savePrediction = useCallback(
    async (fixture: PlayFixtureRow) => {
      setMsg((m) => ({ ...m, [fixture.id]: "" }));
      const validation = validate(fixture.id);
      if (validation) {
        autoSavedLockRef.current.delete(fixture.id);
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
          autoSavedLockRef.current.delete(fixture.id);
        } else {
          setMsg((m) => ({ ...m, [fixture.id]: "Saved" }));
          setAlreadySavedFixtureIds((prev) => new Set(prev).add(fixture.id));
          setLastSavedScores((prev) => ({ ...prev, [fixture.id]: { h: hg, a: ag } }));
        }
      } catch (e: unknown) {
        autoSavedLockRef.current.delete(fixture.id);
        setMsg((m) => ({ ...m, [fixture.id]: `Error: ${String(e instanceof Error ? e.message : e)}` }));
      }

      setSaving((s) => ({ ...s, [fixture.id]: false }));
    },
    [homeGoals, awayGoals, validate]
  );

  /** When odds lock with a valid unsaved line, persist once so the prediction is stored. */
  useEffect(() => {
    if (fixtures.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      for (const f of fixtures) {
        if (cancelled) return;
        if (!f.odds_locked_at) continue;
        if (alreadySavedFixtureIds.has(f.id)) continue;
        if (autoSavedLockRef.current.has(f.id)) continue;
        const hgStr = homeGoals[f.id];
        const agStr = awayGoals[f.id];
        const hasInput =
          (hgStr ?? "").trim() !== "" && (agStr ?? "").trim() !== "";
        if (!hasInput) continue;
        const hg = parseGoal(hgStr);
        const ag = parseGoal(agStr);
        if (
          !Number.isInteger(hg) ||
          hg < 0 ||
          !Number.isInteger(ag) ||
          ag < 0
        ) {
          continue;
        }
        autoSavedLockRef.current.add(f.id);
        await savePrediction(f);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fixtures, alreadySavedFixtureIds, homeGoals, awayGoals, savePrediction]);

  function isFixtureEditable(f: PlayFixtureRow): boolean {
    const statusLower = (f.status ?? "").toLowerCase();
    const kickoffPassed = new Date(f.kickoff_time).getTime() <= Date.now();
    const locked = !!f.odds_locked_at;
    return statusLower === "scheduled" && !kickoffPassed && !locked;
  }

  async function saveAll() {
    for (const f of fixtures) {
      if (!isFixtureEditable(f)) continue;
      const hgStr = homeGoals[f.id];
      const agStr = awayGoals[f.id];
      const hasInput = (hgStr ?? "") !== "" || (agStr ?? "") !== "";
      if (!hasInput || alreadySavedFixtureIds.has(f.id)) continue;
      if (validate(f.id)) continue;
      await savePrediction(f);
    }
  }

  const hasUnsaved = fixtures.some((f) => {
    if (!isFixtureEditable(f)) return false;
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
          <p className="text-muted-foreground">No fixtures for this gameweek.</p>
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
                    {groupFixtures.map((f) => (
                      <PlayMatchCard
                        key={f.id}
                        f={f}
                        nowMs={now}
                        homeGoals={homeGoals}
                        awayGoals={awayGoals}
                        setHomeGoals={setHomeGoals}
                        setAwayGoals={setAwayGoals}
                        saving={saving}
                        msg={msg}
                        savePrediction={savePrediction}
                        alreadySavedFixtureIds={alreadySavedFixtureIds}
                        lastSavedScores={lastSavedScores}
                        matchOfTheWeekFixtureId={matchOfTheWeekFixtureId}
                        meta={predictionMeta[f.id]}
                      />
                    ))}
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
      </div>
    </main>
  );
}
