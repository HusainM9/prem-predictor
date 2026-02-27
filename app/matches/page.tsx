"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Fixture = {
  id: string;
  kickoff_time: string;
  home_team: string;
  away_team: string;
  status: string;
  gameweek: number;
  home_goals: number | null;
  away_goals: number | null;
};

function hasScore(f: Fixture): boolean {
  const h = f.home_goals;
  const a = f.away_goals;
  return h != null && a != null && Number.isInteger(Number(h)) && Number.isInteger(Number(a));
}

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

function displayStatus(f: Fixture): string {
  const s = (f.status ?? "").toLowerCase();
  const inPlay = ["1h", "2h", "ht", "live", "in_play", "inplay"];
  if (inPlay.includes(s)) return "Ongoing";
  if (s === "scheduled") {
    const kickoff = new Date(f.kickoff_time).getTime();
    if (kickoff <= Date.now()) return "Ongoing";
    return "Scheduled";
  }
  if (s === "ft") return "Full time";
  return f.status || "–";
}

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export default function MatchesPage() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [gw, setGw] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load(isInitial: boolean) {
    if (isInitial) {
      setLoading(true);
      setErr(null);
    } else {
      setRefreshing(true);
    }
    const nowIso = new Date().toISOString();

    const { data: nextRow } = await supabase
      .from("fixtures")
      .select("gameweek")
      .eq("season", "2025/26")
      .eq("status", "scheduled")
      .gte("kickoff_time", nowIso)
      .order("kickoff_time", { ascending: true })
      .limit(1)
      .maybeSingle();

    let gameweek = nextRow?.gameweek ?? null;
    if (gameweek == null) {
      const { data: lastRow } = await supabase
        .from("fixtures")
        .select("gameweek")
        .eq("season", "2025/26")
        .order("gameweek", { ascending: false })
        .limit(1)
        .maybeSingle();
      gameweek = lastRow?.gameweek ?? 1;
    }
    setGw(gameweek);

    const { data: gwFx, error: fxErr } = await supabase
      .from("fixtures")
      .select("id,kickoff_time,home_team,away_team,status,gameweek,home_goals,away_goals")
      .eq("season", "2025/26")
      .eq("gameweek", gameweek)
      .order("kickoff_time", { ascending: true });

    if (fxErr) {
      setErr(fxErr.message);
      setFixtures([]);
    } else {
      const gwList = (gwFx ?? []) as Fixture[];
      const firstKickoff = gwList.length > 0 ? gwList[0].kickoff_time : null; // Show any fixture that kicks off before the first match of this gameweek and isn't finished
      let extraList: Fixture[] = [];
      if (firstKickoff) {
        const { data: extraFx } = await supabase
          .from("fixtures")
          .select("id,kickoff_time,home_team,away_team,status,gameweek,home_goals,away_goals")
          .eq("season", "2025/26")
          .lt("kickoff_time", firstKickoff)
          .neq("status", "finished")
          .order("kickoff_time", { ascending: true });
        if (extraFx) extraList = extraFx as Fixture[];
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
      setFixtures(combined);
    }
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    load(true);
    const t = setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  if (loading) return <main style={{ padding: 24 }}><p>Loading matches…</p></main>;
  if (err) return <main style={{ padding: 24 }}><p style={{ color: "crimson" }}>Error: {err}</p></main>;

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>Matches</h1>
      <p style={{ opacity: 0.75, marginBottom: 20, fontSize: 14 }}>
        Gameweek {gw ?? "…"} · Live scores
        {lastUpdated && (
          <span style={{ marginLeft: 8 }}>
            · Updated {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            {refreshing && " (updating…)"}
          </span>
        )}
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        {fixtures.map((f) => (
          <div
            key={f.id}
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{f.home_team}</span>
              <span style={{ fontSize: 18, fontWeight: 700, minWidth: 48, textAlign: "center" }}>
                {hasScore(f) ? `${Number(f.home_goals)} – ${Number(f.away_goals)}` : "–"}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, textAlign: "right" }}>{f.away_team}</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
              {formatKickoff(f.kickoff_time)} · {displayStatus(f)}
            </div>
          </div>
        ))}
      </div>

      {fixtures.length === 0 && (
        <p style={{ opacity: 0.7 }}>No matches for this gameweek.</p>
      )}
    </main>
  );
}
