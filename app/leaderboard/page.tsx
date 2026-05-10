"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { LeaderboardTable, type LeaderboardEntry } from "@/components/leaderboard/LeaderboardTable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getLeaderboardTitle } from "@/lib/leaderboard";
import { isReservedLeagueName } from "@/lib/name-validation";

const PAGE_SIZE = 50;

type LeagueOption = { id: string; name: string };

function LeaderboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leagueIdFromUrl = searchParams.get("leagueId") ?? "";
  const gameweekFromUrl = searchParams.get("gameweek") ?? "";

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [leagueName, setLeagueName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [currentGameweek, setCurrentGameweek] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const leagueId = leagueIdFromUrl.trim() || null;
  const effectiveGameweek =
    gameweekFromUrl.trim() !== ""
      ? (() => {
          const n = Number(gameweekFromUrl);
          return Number.isInteger(n) && n >= 1 ? n : null;
        })()
      : null;

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!leagueId) queueMicrotask(() => setLeagueName(null));
  }, [leagueId]);

  const fetchLeagues = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: members, error: memErr } = await supabase
      .from("league_members")
      .select("league_id")
      .eq("user_id", session.user.id);
    if (memErr || !members?.length) {
      setLeagues([]);
      return;
    }
    const ids = [...new Set(members.map((m) => m.league_id))];
    const { data: rows } = await supabase
      .from("leagues")
      .select("id, name")
      .in("id", ids)
      .order("name");
    setLeagues((rows ?? []) as LeagueOption[]);
  }, [setLeagues]);

  const fetchCurrentGameweek = useCallback(async () => {
    const res = await fetch("/api/gameweek/current");
    const d = await res.json();
    if (res.ok && d.gameweek != null) setCurrentGameweek(d.gameweek);
  }, [setCurrentGameweek]);

  useEffect(() => {
    queueMicrotask(() => {
      fetchLeagues();
      fetchCurrentGameweek();
    });
  }, [fetchLeagues, fetchCurrentGameweek]);

  const fetchLeaderboard = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const params = new URLSearchParams();
    if (leagueId) params.set("leagueId", leagueId);
    if (effectiveGameweek != null) params.set("gameweek", String(effectiveGameweek));
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/leaderboard?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setErr(d.error);
        else {
          setEntries(d.entries ?? []);
          setTotalCount(d.total_count ?? 0);
          if (d.league_name !== undefined) setLeagueName(d.league_name ?? null);
          if (leagueId && isReservedLeagueName(d.league_name)) {
            const next = new URLSearchParams(searchParams.toString());
            next.delete("leagueId");
            if (effectiveGameweek != null) next.set("gameweek", String(effectiveGameweek));
            if (search.trim()) next.set("search", search.trim());
            router.replace(next.toString() ? `/leaderboard?${next.toString()}` : "/leaderboard");
            return;
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveGameweek, leagueId, page, search, router, searchParams, setLoading, setErr, setEntries, setTotalCount, setLeagueName]);

  useEffect(() => {
    const cancelRef = { current: null as (() => void) | null };
    queueMicrotask(() => { cancelRef.current = fetchLeaderboard(); });
    return () => cancelRef.current?.();
  }, [fetchLeaderboard]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const from = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount);

  const title = getLeaderboardTitle(leagueName, leagueId, effectiveGameweek);
  const myEntry = currentUserId ? entries.find((e) => e.user_id === currentUserId) : null;
  const standingsLabel = effectiveGameweek != null ? `GW ${effectiveGameweek} standings` : "Overall standings";
  const subtitle = leagueName ? `${leagueName} / ${standingsLabel}` : standingsLabel;

  const setLeague = (id: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (id) next.set("leagueId", id);
    else next.delete("leagueId");
    next.delete("offset");
    setPage(0);
    router.push(next.toString() ? `/leaderboard?${next.toString()}` : "/leaderboard");
  };

  const setGameweek = (gw: number | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (gw != null) next.set("gameweek", String(gw));
    else next.delete("gameweek");
    next.delete("offset");
    setPage(0);
    router.push(next.toString() ? `/leaderboard?${next.toString()}` : "/leaderboard");
  };

  const gameweekOptions = currentGameweek != null
    ? Array.from({ length: currentGameweek }, (_, i) => i + 1)
    : [];
  const isCurrentGwView = effectiveGameweek != null && currentGameweek != null && effectiveGameweek === currentGameweek;

  return (
    <main className="min-h-screen text-foreground">
      <div className="mx-auto max-w-4xl px-3 py-4 sm:px-4 sm:py-6">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Dashboard
          </Link>
        </div>

        <section className="mb-5 overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-4 shadow-2xl shadow-primary/5 ring-1 ring-primary/10 backdrop-blur sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Standings
              </div>
              <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                {currentUserId && myEntry && totalCount > 0 ? (
                  <>
                    You are <span className="text-primary">#{myEntry.rank}</span>
                  </>
                ) : (
                  title
                )}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {currentUserId && myEntry && totalCount > 0
                  ? `${subtitle} / ${totalCount} players`
                  : subtitle}
              </p>
            </div>
            {!currentUserId && totalCount > 0 && (
              <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
                Log in to see your rank
              </Link>
            )}
          </div>
        </section>

        <section className="mb-5 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-lg shadow-black/10 backdrop-blur">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  League
                </span>
                <Select
                  value={leagueId ?? "__global__"}
                  onValueChange={(v) => setLeague(v === "__global__" ? null : v)}
                >
                  <SelectTrigger className="w-full bg-background/55">
                    <SelectValue placeholder="Global league" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__global__">Global league</SelectItem>
                    {leagues.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Gameweek
                </span>
                <Select
                  value={effectiveGameweek != null ? String(effectiveGameweek) : "__all__"}
                  onValueChange={(v) => setGameweek(v === "__all__" ? null : Number(v))}
                >
                  <SelectTrigger className="w-full bg-background/55">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All gameweeks</SelectItem>
                    {gameweekOptions.map((gw) => (
                      <SelectItem key={gw} value={String(gw)}>
                        GW {gw}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Search
              </span>
              <input
                type="text"
                placeholder="Display name..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="min-h-[40px] w-full rounded-lg border border-input bg-background/55 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-56"
              />
            </label>
          </div>
        </section>

        {err && (
          <p className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Error: {err}
          </p>
        )}
        {isCurrentGwView && (
          <p className="mb-3 rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm text-muted-foreground">
            Current gameweek points may still be settling. Scores update every 30 minutes.
          </p>
        )}

        <LeaderboardTable
          entries={entries}
          currentUserId={currentUserId}
          title={title}
          loading={loading}
        />

        {!loading && totalCount > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-lg shadow-black/10">
            <span className="text-sm text-muted-foreground">
              Showing {from}–{to} of {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="min-h-[40px] rounded-lg border border-border bg-background/55 px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="min-h-[40px] rounded-lg border border-border bg-background/55 px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[640px] p-6 max-sm:px-3 max-sm:py-4 sm:p-6"><p>Loading…</p></main>}>
      <LeaderboardContent />
    </Suspense>
  );
}
