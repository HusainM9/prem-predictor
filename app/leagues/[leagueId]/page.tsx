"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

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

type FixtureRow = {
  id: string;
  kickoff_time: string;
  home_team: string;
  away_team: string;
  status: string;
  gameweek: number;
  home_goals?: number | null;
  away_goals?: number | null;
};

export default function LeaguePage() {
  const params = useParams();
  const leagueId = typeof params.leagueId === "string" ? params.leagueId : null;

  const [leagueName, setLeagueName] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [gameweek, setGameweek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) {
      setErr("Missing league");
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setErr(null);

      const nowIso = new Date().toISOString();

      const { data: league, error: leagueErr } = await supabase
        .from("leagues")
        .select("id, name, invite_code")
        .eq("id", leagueId)
        .maybeSingle();

      if (leagueErr || !league) {
        setErr(leagueErr?.message ?? "League not found");
        setLoading(false);
        return;
      }
      setLeagueName(league.name);
      setInviteCode(league.invite_code ?? null);

      const { data: gwRow, error: gwErr } = await supabase
        .from("fixtures")
        .select("gameweek")
        .eq("season", "2025/26")
        .eq("status", "scheduled")
        .gte("kickoff_time", nowIso)
        .order("kickoff_time", { ascending: true })
        .limit(1)
        .maybeSingle();

      const currentGw = gwErr ? 1 : (gwRow?.gameweek ?? 1);
      setGameweek(currentGw);

      const { data: fx, error: fxErr } = await supabase
        .from("fixtures")
        .select("id, kickoff_time, home_team, away_team, status, gameweek, home_goals, away_goals")
        .eq("season", "2025/26")
        .eq("gameweek", currentGw)
        .gte("kickoff_time", nowIso)
        .order("kickoff_time", { ascending: true });

      if (fxErr) {
        setErr(fxErr.message);
        setFixtures([]);
      } else {
        setFixtures((fx ?? []) as FixtureRow[]);
      }

      setLoading(false);
    }

    load();
  }, [leagueId]);

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <Link href="/leagues" style={{ opacity: 0.85, fontSize: 14 }}>
          ← All leagues
        </Link>
      </div>

      {loading && <p>Loading…</p>}
      {err && <p style={{ color: "crimson" }}>Error: {err}</p>}

      {!loading && !err && leagueName && (
        <>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>{leagueName}</h1>

          {inviteCode != null && inviteCode !== "" && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Invite code</h2>
              <p style={{ opacity: 0.85, marginBottom: 8 }}>
                Share this code so others can join the league. They can enter it on the Leagues page.
              </p>
              <div
                style={{
                  display: "inline-block",
                  padding: "12px 20px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  fontFamily: "monospace",
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: 4,
                }}
              >
                {inviteCode}
              </div>
            </section>
          )}

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Predict</h2>
            <p style={{ opacity: 0.85, marginBottom: 12 }}>
              Your predictions apply to the global leaderboard and every league you’re in unless otherwise specified.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <Link
                href="/play"
                style={{
                  display: "inline-block",
                  padding: "12px 20px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  fontWeight: 600,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                Make predictions →
              </Link>
              <Link
                href={`/leaderboard?leagueId=${encodeURIComponent(leagueId ?? "")}`}
                style={{ opacity: 0.9, fontSize: 14 }}
              >
                View league leaderboard
              </Link>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>
              Fixtures — Gameweek {gameweek ?? "…"}
            </h2>
            {fixtures.length === 0 ? (
              <p style={{ opacity: 0.75 }}>No upcoming fixtures for this gameweek.</p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {fixtures.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 24, minWidth: 0 }}>
                      <div style={{ flex: 1, textAlign: "left", minWidth: 0, fontSize: 18, fontWeight: 600 }}>
                        {f.home_team}
                      </div>
                      <div
                        style={{
                          minWidth: 48,
                          textAlign: "center",
                          fontSize: 18,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {f.home_goals != null && f.away_goals != null
                          ? `${f.home_goals} – ${f.away_goals}`
                          : "–"}
                      </div>
                      <div style={{ flex: 1, textAlign: "right", minWidth: 0, fontSize: 18, fontWeight: 600 }}>
                        {f.away_team}
                      </div>
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 13 }}>
                      Kickoff: {formatKickoff(f.kickoff_time)} · {f.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
