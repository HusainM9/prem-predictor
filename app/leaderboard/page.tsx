"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { LeaderboardTable, type LeaderboardEntry } from "@/components/leaderboard/LeaderboardTable";
import { getEffectiveGameweek, getLeaderboardTitle } from "@/lib/leaderboard";
import { isReservedLeagueName } from "@/lib/name-validation";

const PAGE_SIZE = 50;

export default function LeaderboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leagueIdFromUrl = searchParams.get("leagueId") ?? "";

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [leagueName, setLeagueName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [gameweek, setGameweek] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // Debounce search so we don't refetch on every keystroke
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

  const effectiveGameweek = getEffectiveGameweek(gameweek);
  const leagueId = leagueIdFromUrl.trim() || null;

  useEffect(() => {
    if (!leagueId) setLeagueName(null);
  }, [leagueId]);

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
          // If this league is the "global" one, redirect to /leaderboard so there's one URL and one title
          if (leagueId && isReservedLeagueName(d.league_name)) {
            const next = new URLSearchParams();
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
  }, [effectiveGameweek, leagueId, page, search]);

  useEffect(() => {
    const cancel = fetchLeaderboard();
    return cancel;
  }, [fetchLeaderboard]);


  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const from = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount);

  const title = getLeaderboardTitle(leagueName, leagueId, effectiveGameweek);

  return (
    <main style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/" style={{ opacity: 0.9, marginRight: 12 }}>Home</Link>
        <Link href="/play" style={{ opacity: 0.9, marginRight: 12 }}>Play</Link>
        <Link href="/matches" style={{ opacity: 0.9, marginRight: 12 }}>Matches</Link>
        <Link href="/history" style={{ opacity: 0.9 }}>My history</Link>
        {leagueId && (
          <Link href={`/leagues/${leagueId}`} style={{ opacity: 0.9, marginLeft: 12 }}>← League</Link>
        )}
      </div>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Leaderboard</h1>
      <p style={{ opacity: 0.8, marginBottom: 12 }}>
        Points from settled predictions. Filter by gameweek below for per-gameweek standings.
      </p>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        Gameweek
        <input
          type="number"
          min={0}
          placeholder="All"
          value={gameweek}
          onChange={(e) => setGameweek(e.target.value)}
          style={{ width: 80, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        Search by name
        <input
          type="text"
          placeholder="Display name…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ flex: 1, maxWidth: 220, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
        />
      </label>
      {err && <p style={{ color: "crimson", marginBottom: 12 }}>Error: {err}</p>}
      <LeaderboardTable
        entries={entries}
        currentUserId={currentUserId}
        title={title}
        loading={loading}
      />
      {!loading && totalCount > 0 && (
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
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
