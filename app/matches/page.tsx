"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { TeamDisplay } from "@/components/TeamDisplay";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { useReactions } from "@/hooks/useReactions";
import { MatchReactionPanel } from "@/components/reactions/MatchReactionPanel";

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
  form?: {
    home_team: {
      team: string;
      last_five: Array<{
        kickoff_time: string;
        team: string;
        opponent: string;
        goals_for: number;
        goals_against: number;
        result: "W" | "D" | "L";
      }>;
    };
    away_team: {
      team: string;
      last_five: Array<{
        kickoff_time: string;
        team: string;
        opponent: string;
        goals_for: number;
        goals_against: number;
        result: "W" | "D" | "L";
      }>;
    };
  };
};

type TeamForm = {
  team: string;
  last_five: Array<{
      kickoff_time: string;
      team: string;
      opponent: string;
      goals_for: number;
      goals_against: number;
      result: "W" | "D" | "L";
    }>;
  };

function hasScore(f: Fixture): boolean {
  const h = f.home_goals;
  const a = f.away_goals;
  return h != null && a != null && Number.isInteger(Number(h)) && Number.isInteger(Number(a));
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDateHeader(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formChipClass(result: "W" | "D" | "L"): string {
  if (result === "W") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-300";
  if (result === "L") return "border-red-400/40 bg-red-500/15 text-red-300";
  return "border-border bg-muted/40 text-muted-foreground";
}

function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isLive(f: Fixture): boolean {
  const s = (f.status ?? "").toLowerCase();
  return ["1h", "2h", "ht", "live", "in_play", "inplay"].includes(s) || (s === "scheduled" && new Date(f.kickoff_time).getTime() <= Date.now());
}

function displayStatus(f: Fixture): string {
  const s = (f.status ?? "").toLowerCase();
  if (s === "ft" || s === "finished") return "FT";
  if (["1h", "2h", "ht", "live", "in_play", "inplay"].includes(s)) return "• LIVE";
  if (s === "scheduled") return "•";
  return (f.status ?? "–").toUpperCase().slice(0, 4);
}

const POLL_INTERVAL_MS = 2 * 60 * 1000;

export default function MatchesPage() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [gw, setGw] = useState<number | null>(null);
  const [currentGw, setCurrentGw] = useState<number | null>(null);
  const [minGw, setMinGw] = useState<number>(1);
  const [maxGw, setMaxGw] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [canReact, setCanReact] = useState(false);
  const gwRef = useRef<number | null>(null);
  useEffect(() => {
    gwRef.current = gw;
  }, [gw]);

  async function load(isInitial: boolean, targetGw?: number | null) {
    if (isInitial) {
      setLoading(true);
      setErr(null);
    } else {
      setRefreshing(true);
    }
    try {
      const requestedTarget =
        targetGw != null
          ? targetGw
          : isInitial
            ? null
            : gwRef.current ?? null;
      const query = requestedTarget != null ? `?targetGw=${requestedTarget}` : "";
      const res = await fetch(`/api/matches/overview${query}`);
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Failed to load matches");
        setFixtures([]);
      } else {
        setErr(null);
        const baseFixtures = Array.isArray(data.fixtures) ? (data.fixtures as Fixture[]) : [];
        let fixturesWithForm = baseFixtures;
        if (baseFixtures.length > 0) {
          const fixtureIds = baseFixtures.map((f) => f.id).join(",");
          try {
            const formRes = await fetch(`/api/matches/form?fixtureIds=${encodeURIComponent(fixtureIds)}`);
            const formData = await formRes.json().catch(() => ({}));
            if (formRes.ok && formData.forms && typeof formData.forms === "object") {
              const forms = formData.forms as Record<string, Fixture["form"]>;
              fixturesWithForm = baseFixtures.map((f) => ({
                ...f,
                form: forms[f.id] ?? f.form,
              }));
            }
          } catch {
          }
        }
        setFixtures(fixturesWithForm);
        setCurrentGw(data.current_gameweek ?? null);
        setMinGw(data.min_gameweek ?? 1);
        setMaxGw(data.max_gameweek ?? null);
        setGw(data.viewing_gameweek ?? null);
        setLastUpdated(data.updated_at ? new Date(data.updated_at) : new Date());
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setFixtures([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => load(true));
    const t = setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCanReact(!!data.session);
    });
  }, []);

  const reactionTargetIds = useMemo(() => fixtures.map((f) => f.id), [fixtures]);
  const { summaryById, pendingById, react, message: reactionMessage } = useReactions(
    "match",
    reactionTargetIds
  );

  const canGoPrev = gw != null && minGw != null && gw > minGw;
  const canGoNext = gw != null && maxGw != null && gw < maxGw;

  const byDate = useMemo(() => {
    const map = new Map<string, Fixture[]>();
    for (const f of fixtures) {
      const key = dateKey(f.kickoff_time);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    const keys = [...map.keys()].sort((a, b) => a.localeCompare(b));
    return keys.map((key) => {
      const list = [...(map.get(key)!)];
      list.sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time));
      return { dateKey: key, dateLabel: formatDateHeader(list[0].kickoff_time), list };
    });
  }, [fixtures]);

  if (loading) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-3xl px-3 py-4 max-sm:px-3 max-sm:py-4 sm:px-4 sm:py-6">
          <p className="text-muted-foreground max-sm:text-sm">Loading matches…</p>
        </div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-3xl px-3 py-4 max-sm:px-3 max-sm:py-4 sm:px-4 sm:py-6">
          <p className="text-destructive max-sm:text-sm">Error: {err}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-3 py-4 max-sm:px-3 max-sm:py-4 sm:px-4 sm:py-6">
        <div className="mb-4">
          <Link href="/" className="inline-flex min-h-[44px] items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            ← Back
          </Link>
        </div>

        <section className="mb-6 overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-4 shadow-2xl shadow-primary/5 ring-1 ring-primary/10 backdrop-blur sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Fixtures
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full bg-background/55"
                  disabled={!canGoPrev}
                  onClick={() => load(false, (gw ?? minGw) - 1)}
                  aria-label="Previous gameweek"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                  GW {gw ?? "…"} Matches
                </h1>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full bg-background/55"
                  disabled={!canGoNext}
                  onClick={() => load(false, (gw ?? currentGw ?? 1) + 1)}
                  aria-label="Next gameweek"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Live scores, form guide and fan reactions for each fixture.
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/55 px-3 py-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Updated
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {lastUpdated
                  ? lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                  : "—"}
                {refreshing && " updating…"}
              </p>
            </div>
          </div>
          {gw !== null && currentGw !== null && gw !== currentGw && (
            <p className="mt-4 text-xs text-muted-foreground">
              Viewing {gw < currentGw ? "past" : "future"} fixtures. Current gameweek is GW {currentGw}.
            </p>
          )}
        </section>

        {fixtures.length === 0 ? (
          <p className="text-muted-foreground max-sm:text-sm">No matches for this gameweek.</p>
        ) : (
          <div className="space-y-4 max-sm:space-y-4 sm:space-y-8">
            {byDate.map(({ dateKey: key, dateLabel, list }) => (
              <section key={key}>
                <div className="mb-3 rounded-full border border-border/60 bg-card/50 px-3 py-2">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {dateLabel}
                  </h2>
                </div>
                <div className="space-y-3">
                  {list.map((f) => {
                    const live = isLive(f);
                    const scoreText = hasScore(f)
                      ? `${Number(f.home_goals)} - ${Number(f.away_goals)}`
                      : "–";
                    const homeForm: TeamForm = f.form?.home_team ?? { team: f.home_team, last_five: [] };
                    const awayForm: TeamForm = f.form?.away_team ?? { team: f.away_team, last_five: [] };
                    return (
                      <article
                        key={f.id}
                        className={`relative overflow-hidden rounded-2xl border border-border/80 bg-card/85 p-4 shadow-xl shadow-black/15 ring-1 ring-primary/5 ${
                          live ? "border-primary/40 ring-primary/35" : ""
                        }`}
                      >
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent" />
                        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/45 px-3 py-2">
                          <div className="text-xs font-semibold text-muted-foreground">
                            {formatTime(f.kickoff_time)}
                          </div>
                          <div className={live ? "rounded-full border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary" : "rounded-full border border-border bg-muted/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"}>
                            {f.is_stuck && !hasScore(f) ? "Awaiting result" : displayStatus(f)}
                          </div>
                        </div>

                        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-border/70 bg-background/50 p-3 shadow-inner shadow-black/10">
                          <TeamDisplay teamName={f.home_team} size={34} align="end" />
                          <div className="rounded-xl border border-primary/45 bg-card px-4 py-2 text-base font-black tabular-nums text-foreground shadow-lg shadow-primary/10">
                            {scoreText}
                          </div>
                          <TeamDisplay teamName={f.away_team} size={34} align="start" />
                        </div>

                        <div className="mb-3 grid grid-cols-2 gap-3">
                          <div className="rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5 text-xs text-muted-foreground">
                            <p className="font-semibold text-foreground/90">{homeForm.team} form</p>
                            <div className="mt-2 flex items-center gap-1">
                              {homeForm.last_five.length === 0 ? (
                                <span className="text-[11px] text-muted-foreground">No recent matches</span>
                              ) : (
                                homeForm.last_five.map((m, idx) => (
                                  <span
                                    key={`${f.id}-home-form-dot-${idx}`}
                                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md border px-1 text-[10px] font-bold ${formChipClass(m.result)}`}
                                    title={`${m.result}: ${m.team} ${m.goals_for}-${m.goals_against} ${m.opponent}`}
                                  >
                                    {m.result}
                                  </span>
                                ))
                              )}
                            </div>
                            {homeForm.last_five.length > 0 && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-foreground/90 hover:text-foreground">
                                  Last 5 matches
                                </summary>
                                <ul className="mt-2 space-y-1.5">
                                  {homeForm.last_five.map((m, idx) => (
                                    <li key={`${f.id}-home-form-${idx}`} className="text-[11px] sm:text-xs">
                                      {formatShortDate(m.kickoff_time)} · {m.team} {m.goals_for}-{m.goals_against} {m.opponent}
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </div>
                          <div className="rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5 text-xs text-muted-foreground text-right">
                            <p className="font-semibold text-foreground/90">{awayForm.team} form</p>
                            <div className="mt-2 flex items-center justify-end gap-1">
                              {awayForm.last_five.length === 0 ? (
                                <span className="text-[11px] text-muted-foreground">No recent matches</span>
                              ) : (
                                awayForm.last_five.map((m, idx) => (
                                  <span
                                    key={`${f.id}-away-form-dot-${idx}`}
                                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md border px-1 text-[10px] font-bold ${formChipClass(m.result)}`}
                                    title={`${m.result}: ${m.team} ${m.goals_for}-${m.goals_against} ${m.opponent}`}
                                  >
                                    {m.result}
                                  </span>
                                ))
                              )}
                            </div>
                            {awayForm.last_five.length > 0 && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-foreground/90 hover:text-foreground">
                                  Last 5 matches
                                </summary>
                                <ul className="mt-2 space-y-1.5">
                                  {awayForm.last_five.map((m, idx) => (
                                    <li key={`${f.id}-away-form-${idx}`} className="text-[11px] sm:text-xs">
                                      {formatShortDate(m.kickoff_time)} · {m.team} {m.goals_for}-{m.goals_against} {m.opponent}
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </div>
                        </div>

                        <MatchReactionPanel
                          summary={summaryById[f.id]}
                          pending={pendingById[f.id]}
                          disabled={!canReact}
                          onReact={(emoji) => {
                            void react(f.id, emoji);
                          }}
                        />
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
        {reactionMessage && (
          <p className="mt-3 text-sm text-muted-foreground">{reactionMessage}</p>
        )}
      </div>
    </main>
  );
}
