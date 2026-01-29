"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type FixtureRow = {
  id: string;
  kickoff_time: string;
  home_team: string;
  away_team: string;
  status: string;
};

const TARGET_FIXTURES = [
  { home: "Brighton & Hove Albion FC", away: "Everton FC" },
  { home: "Wolverhampton Wanderers FC", away: "AFC Bournemouth" },
];

export default function LeaguePage() {
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const orFilter = useMemo(() => {
    // Supabase .or() format: "and(col.eq.x,col.eq.y),and(col.eq.a,col.eq.b)"
    return TARGET_FIXTURES.map(
      (f) => `and(home_team.eq.${escapeFilter(f.home)},away_team.eq.${escapeFilter(f.away)})`
    ).join(",");
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
      .from("fixtures")
      .select("id,kickoff_time,home_team,away_team,status")
      .or(
        "and(home_team.ilike.%Brighton%,away_team.ilike.%Everton%),and(home_team.ilike.%Wolverhampton%,away_team.ilike.%Bournemouth%)"
      )
      .order("kickoff_time", { ascending: true });
    
      if (error) {
        setErr(error.message);
        setFixtures([]);
      } else {
        setFixtures((data ?? []) as FixtureRow[]);
      }

      setLoading(false);
    }

    load();
  }, [orFilter]);

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>League</h1>
      <p style={{ opacity: 0.75, marginBottom: 20 }}>
        Showing the 2 real fixtures we’re using for MVP testing.
      </p>

      {loading && <p>Loading fixtures…</p>}
      {err && <p style={{ color: "crimson" }}>Error: {err}</p>}

      {!loading && !err && (
        <div style={{ display: "grid", gap: 12 }}>
          {fixtures.map((f) => (
            <div
              key={f.id}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                padding: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>
                  {f.home_team} <span style={{ opacity: 0.7 }}>vs</span> {f.away_team}
                </div>
                <div style={{ opacity: 0.75, marginTop: 4 }}>
                  Kickoff: {formatKickoff(f.kickoff_time)} • Status: {f.status}
                </div>
              </div>

              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.16)",
                  fontSize: 12,
                  opacity: 0.85,
                }}
              >
                GW fixture
              </span>
            </div>
          ))}

          {fixtures.length === 0 && (
            <p style={{ opacity: 0.75 }}>
              No fixtures found. (Double-check the team names match your DB exactly.)
            </p>
          )}
        </div>
      )}
    </main>
  );
}

// Supabase filter strings break if they contain commas; also safer to wrap in quotes if needed.
// Here we just escape commas; your team names shouldn’t have commas anyway.
function escapeFilter(value: string) {
  return value.replaceAll(",", "\\,");
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
