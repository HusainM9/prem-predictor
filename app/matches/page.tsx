"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { TeamDisplay } from "@/components/TeamDisplay";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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
        setFixtures(Array.isArray(data.fixtures) ? (data.fixtures as Fixture[]) : []);
        setCurrentGw(data.current_gameweek ?? null);
        setMinGw(data.min_gameweek ?? 1);
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

  const canGoPrev = gw != null && minGw != null && gw > minGw;
  const canGoNext = gw != null && currentGw != null && gw < currentGw;

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
      <div className="mx-auto max-w-3xl px-3 py-4 max-sm:px-3 max-sm:py-4 sm:px-4 sm:py-6">
        <div className="mb-4 flex items-center gap-2 max-sm:mb-4 max-sm:gap-2 sm:mb-6 sm:gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors max-sm:text-sm">
            ← Back
          </Link>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold text-foreground max-sm:text-sm">Scoreline</span>
        </div>

        <div className="mb-4 flex flex-col gap-1.5 max-sm:mb-4 sm:mb-6 sm:gap-2">
          <div className="flex items-center gap-1.5 max-sm:gap-1.5 sm:gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0 max-sm:h-8 max-sm:w-8 sm:h-9 sm:w-9"
              disabled={!canGoPrev}
              onClick={() => load(false, (gw ?? minGw) - 1)}
              aria-label="Previous gameweek"
            >
              <ChevronLeft className="size-4 max-sm:size-3.5" />
            </Button>
            <h1 className="text-xl font-bold text-foreground max-sm:text-lg sm:text-2xl">Matches</h1>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0 max-sm:h-8 max-sm:w-8 sm:h-9 sm:w-9"
              disabled={!canGoNext}
              onClick={() => load(false, (gw ?? currentGw ?? 1) + 1)}
              aria-label="Next gameweek"
            >
              <ChevronRight className="size-4 max-sm:size-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground max-sm:text-xs sm:text-sm">
            Gameweek {gw ?? "…"}
            {gw !== null && currentGw !== null && gw < currentGw && (
              <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-xs">(viewing past · current is GW {currentGw})</span>
            )}
            {lastUpdated && (
              <span className="ml-1.5 sm:ml-2">
                · Updated {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                {refreshing && " (updating…)"}
              </span>
            )}
          </p>
        </div>

        {fixtures.length === 0 ? (
          <p className="text-muted-foreground max-sm:text-sm">No matches for this gameweek.</p>
        ) : (
          <div className="space-y-4 max-sm:space-y-4 sm:space-y-8">
            {byDate.map(({ dateKey: key, dateLabel, list }) => (
              <section key={key}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground max-sm:mb-2 max-sm:text-xs sm:mb-3 sm:text-sm">
                  {dateLabel}
                </h2>
                <div className="rounded-lg border border-border bg-card overflow-hidden max-sm:rounded-md">
                  <div className="overflow-x-auto -mx-px">
                    <table className="w-full min-w-0 table-fixed text-xs max-sm:text-xs sm:min-w-[400px] sm:text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="w-14 py-2 pl-2 pr-1 text-left font-semibold text-foreground whitespace-nowrap max-sm:w-12 max-sm:py-2 max-sm:pl-2 sm:w-24 sm:py-3 sm:pl-4 sm:pr-4">
                            Kick-off
                          </th>
                          <th className="w-14 py-2 px-1 text-left font-semibold text-foreground max-sm:w-12 max-sm:py-2 max-sm:px-1 sm:w-20 sm:py-3 sm:px-3">
                            Status
                          </th>
                          <th className="w-[22%] py-2 px-1 text-right font-semibold text-foreground max-sm:py-2 max-sm:px-1 sm:py-3 sm:px-3">
                            Home
                          </th>
                          <th className="w-14 py-2 px-1 text-center font-semibold text-foreground max-sm:w-12 max-sm:py-2 max-sm:px-1 sm:w-24 sm:py-3 sm:px-4">
                            Score
                          </th>
                          <th className="w-[22%] py-2 pl-1 pr-2 text-left font-semibold text-foreground max-sm:py-2 max-sm:pl-1 max-sm:pr-2 sm:py-3 sm:pl-3 sm:pr-4">
                            Away
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((f) => {
                          const live = isLive(f);
                          return (
                            <tr
                              key={f.id}
                              className={`border-b border-border last:border-b-0 ${
                                live ? "bg-primary/10" : ""
                              }`}
                            >
                              <td className="py-2 pl-2 pr-1 text-muted-foreground whitespace-nowrap max-sm:py-2 max-sm:pl-2 max-sm:pr-1 max-sm:text-[11px] sm:py-3 sm:pl-4 sm:pr-3 sm:text-sm">
                                {formatTime(f.kickoff_time)}
                              </td>
                              <td className="py-2 px-1 max-sm:py-2 max-sm:px-1 max-sm:text-[11px] sm:py-3 sm:px-3 sm:text-sm">
                                {f.is_stuck && !hasScore(f) ? (
                                  <span className="text-muted-foreground text-[10px] italic max-sm:text-[10px] sm:text-xs" title="Kickoff passed but provider has not returned final result">
                                    Awaiting result
                                  </span>
                                ) : (
                                  <span
                                    className={
                                      live
                                        ? "text-primary font-medium"
                                        : "text-muted-foreground"
                                    }
                                  >
                                    {displayStatus(f)}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-1 max-sm:py-2 max-sm:px-1 sm:py-3 sm:px-3">
                                <TeamDisplay teamName={f.home_team} size={20} align="end" />
                              </td>
                              <td className="py-2 px-1 text-center font-bold text-foreground max-sm:py-2 max-sm:px-1 max-sm:text-xs sm:py-3 sm:px-4 sm:text-sm">
                                {hasScore(f)
                                  ? `${Number(f.home_goals)} – ${Number(f.away_goals)}`
                                  : "–"}
                              </td>
                              <td className="py-2 pl-1 pr-2 max-sm:py-2 max-sm:pl-1 max-sm:pr-2 sm:py-3 sm:pl-3 sm:pr-4">
                                <TeamDisplay teamName={f.away_team} size={20} align="start" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
