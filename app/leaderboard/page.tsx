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
    <main className="mx-auto max-w-[640px] p-6 max-sm:px-3 max-sm:py-4 sm:p-6">
      <div style={{ marginBottom: 16 }}>
        <Link href="/" style={{ opacity: 0.9 }}>
          ← Dashboard
        </Link>
      </div>

      {currentUserId && myEntry && totalCount > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
            You are <span style={{ color: "var(--primary, #22c55e)" }}>#{myEntry.rank}</span> of {totalCount}
          </p>
          <p style={{ fontSize: 14, opacity: 0.8 }}>{subtitle}</p>
        </div>
      )}
      {!currentUserId && totalCount > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 4 }}>{standingsLabel}</p>
          <p style={{ fontSize: 14 }}>
            <Link href="/login" style={{ color: "var(--primary, #22c55e)", fontWeight: 500 }}>
              Log in to see your rank
            </Link>
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ opacity: 0.9, fontSize: 24 }} aria-hidden>🏆</span>
          <Select
            value={leagueId ?? "__global__"}
            onValueChange={(v) => setLeague(v === "__global__" ? null : v)}
          >
            <SelectTrigger className="min-w-[180px]">
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
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, opacity: 0.9 }}>Per gameweek</span>
          <Select
            value={effectiveGameweek != null ? String(effectiveGameweek) : "__all__"}
            onValueChange={(v) => setGameweek(v === "__all__" ? null : Number(v))}
          >
            <SelectTrigger className="min-w-[110px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              {gameweekOptions.map((gw) => (
                <SelectItem key={gw} value={String(gw)}>
                  GW {gw}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        Search by name
        <input
          type="text"
          placeholder="Display name…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{
            flex: 1,
            maxWidth: 220,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.06)",
            color: "inherit",
          }}
        />
      </label>

      {err && <p style={{ color: "crimson", marginBottom: 12 }}>Error: {err}</p>}
      {isCurrentGwView && (
        <p style={{ marginBottom: 12, fontSize: 13, opacity: 0.85 }}>
          Current gameweek points may still be settling. Final scores appear after the settlement job runs.
        </p>
      )}
      <LeaderboardTable
        entries={entries}
        currentUserId={currentUserId}
        title={title}
        loading={loading}
      />
      {!loading && totalCount > 0 && (
        <div
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span style={{ opacity: 0.8, fontSize: 14 }}>
            Showing {from}–{to} of {totalCount}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.06)",
                color: "inherit",
                cursor: page <= 0 ? "not-allowed" : "pointer",
                opacity: page <= 0 ? 0.5 : 1,
              }}
            >
              Previous
            </button>
            <span style={{ alignSelf: "center", opacity: 0.8, fontSize: 14 }}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.06)",
                color: "inherit",
                cursor: page >= totalPages - 1 ? "not-allowed" : "pointer",
                opacity: page >= totalPages - 1 ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
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
