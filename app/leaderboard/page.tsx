"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { LeaderboardTable, type LeaderboardEntry } from "@/components/leaderboard/LeaderboardTable";
import { getEffectiveGameweek } from "@/lib/leaderboard";

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [gameweek, setGameweek] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  // Only filter by gameweek when user entered a positive integer; empty or ≤0 = global
  const effectiveGameweek = getEffectiveGameweek(gameweek);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const params = new URLSearchParams();
    if (effectiveGameweek != null) params.set("gameweek", String(effectiveGameweek));
    fetch(`/api/leaderboard?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setErr(d.error);
        else setEntries(d.entries ?? []);
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
  }, [effectiveGameweek]);

  return (
    <main style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/" style={{ opacity: 0.9, marginRight: 12 }}>Home</Link>
        <Link href="/play" style={{ opacity: 0.9, marginRight: 12 }}>Play</Link>
        <Link href="/matches" style={{ opacity: 0.9, marginRight: 12 }}>Matches</Link>
        <Link href="/history" style={{ opacity: 0.9 }}>My history</Link>
      </div>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Leaderboard</h1>
      <p style={{ opacity: 0.8, marginBottom: 12 }}>
        Total points from settled predictions. Filter by gameweek below for per-gameweek standings.
      </p>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        Gameweek (optional)
        <input
          type="number"
          min={0}
          placeholder="All (global)"
          value={gameweek}
          onChange={(e) => setGameweek(e.target.value)}
          style={{ width: 80, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
        />
      </label>
      {err && <p style={{ color: "crimson", marginBottom: 12 }}>Error: {err}</p>}
      <LeaderboardTable
        entries={entries}
        currentUserId={currentUserId}
        title={effectiveGameweek != null ? `Leaderboard (GW ${effectiveGameweek})` : "Global leaderboard"}
        loading={loading}
      />
    </main>
  );
}
