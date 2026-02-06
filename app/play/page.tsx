"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Pick = "H" | "D" | "A";

type FixtureRow = {
  id: string;
  kickoff_time: string;
  home_team: string;
  away_team: string;
  status: string;
  gameweek: number;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  odds_locked_at: string | null;
  odds_home_current: number | null;
  odds_draw_current: number | null;
  odds_away_current: number | null;
  odds_current_updated_at: string | null;
  odds_current_bookmaker: string | null;
};

export default function PlayPage() {
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [pick, setPick] = useState<Record<string, Pick | "">>({});
  const [homeGoals, setHomeGoals] = useState<Record<string, string>>({});
  const [awayGoals, setAwayGoals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [gw, setGw] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr(null);

      // 1) Find current gameweek = earliest GW with scheduled fixtures
      const nowIso = new Date().toISOString();

      const { data: gwRow, error: gwErr } = await supabase
        .from("fixtures")
        .select("gameweek,kickoff_time")
        .eq("season", "2025/26")
        .eq("status", "scheduled")
        .gte("kickoff_time", nowIso)
        .order("kickoff_time", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (gwErr) {
        setErr(gwErr.message);
        setFixtures([]);
        setLoading(false);
        return;
      }

      const currentGw = gwRow?.gameweek ?? 1;
      setGw(currentGw);      

      // 2) Fetch all fixtures for that gameweek
      const { data: fx, error: fxErr } = await supabase
      .from("fixtures")
      .select("id,kickoff_time,home_team,away_team,status,gameweek,odds_home,odds_draw,odds_away,odds_locked_at,odds_home_current,odds_draw_current,odds_away_current,odds_current_updated_at,odds_current_bookmaker")
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
  }, []);

  function validate(fixtureId: string) {
    const p = pick[fixtureId];
    const hgStr = homeGoals[fixtureId];
    const agStr = awayGoals[fixtureId];

    if (!p) return "Pick Home / Draw / Away first.";

    // Correct score is optional: if user leaves blank, allow it
    const hasScore = (hgStr ?? "") !== "" && (agStr ?? "") !== "";
    if (!hasScore) return null;

    const hg = Number(hgStr);
    const ag = Number(agStr);

    if (!Number.isInteger(hg) || hg < 0) return "Home goals must be 0 or more.";
    if (!Number.isInteger(ag) || ag < 0) return "Away goals must be 0 or more.";

    if (p === "H" && !(hg > ag)) return "Home pick requires home goals > away goals.";
    if (p === "A" && !(ag > hg)) return "Away pick requires away goals > home goals.";
    if (p === "D" && hg !== ag) return "Draw pick requires equal goals.";

    return null;
  }

  async function savePrediction(fixture: FixtureRow) {
    setMsg((m) => ({ ...m, [fixture.id]: "" }));

    const validation = validate(fixture.id);
    if (validation) {
      setMsg((m) => ({ ...m, [fixture.id]: validation }));
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setMsg((m) => ({ ...m, [fixture.id]: "Log in to submit predictions." }));
      return;
    }

    setSaving((s) => ({ ...s, [fixture.id]: true }));

    const p = pick[fixture.id] as Pick;
    const hgStr = homeGoals[fixture.id];
    const agStr = awayGoals[fixture.id];
    const hasScore = (hgStr ?? "") !== "" || (agStr ?? "") !== "";

    const payload = {
      userId: user.id,
      fixtureId: fixture.id,
      pick: p,
      predHomeGoals: hasScore ? Number(hgStr) : null,
      predAwayGoals: hasScore ? Number(agStr) : null,
      mode: "global",
      leagueId: null,
    };

    try {
      const res = await fetch("/api/predictions/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setMsg((m) => ({ ...m, [fixture.id]: `Error: ${json.error ?? "Failed"}` }));
      } else {
        setMsg((m) => ({ ...m, [fixture.id]: "Saved ✅" }));
      }
    } catch (e: any) {
      setMsg((m) => ({ ...m, [fixture.id]: `Error: ${String(e?.message ?? e)}` }));
    }

    setSaving((s) => ({ ...s, [fixture.id]: false }));
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>Fixtures</h1>
      <p style={{ opacity: 0.75, marginBottom: 18 }}>
        Gameweek: <strong>{gw ?? "…"}</strong> • Stake fixed at 10 • If correct result: 10 × locked odds
      </p>

      {loading && <p>Loading fixtures…</p>}
      {err && <p style={{ color: "crimson" }}>Error: {err}</p>}

      {!loading && !err && fixtures.length === 0 && (
        <p>No scheduled fixtures found for the current gameweek.</p>
      )}

      {!loading && !err && fixtures.length > 0 && (
        <div style={{ display: "grid", gap: 14 }}>
          {fixtures.map((f) => {
          const locked = !!f.odds_locked_at;

          const oddsSource = locked
            ? "locked"
            : (f.odds_home_current != null && f.odds_draw_current != null && f.odds_away_current != null)
              ? "current"
              : "none";
              
          const oddsH = locked ? f.odds_home : f.odds_home_current;
          const oddsD = locked ? f.odds_draw : f.odds_draw_current;
          const oddsA = locked ? f.odds_away : f.odds_away_current;

          const book = locked ? null : f.odds_current_bookmaker; // optional display

            return (
              <div
                key={f.id}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {f.home_team} <span style={{ opacity: 0.7 }}>vs</span> {f.away_team}
                </div>

                <div style={{ opacity: 0.75, marginTop: 4 }}>
                  Kickoff: {formatKickoff(f.kickoff_time)} • Status: {f.status} •{" "}
                  {locked ? "Odds locked ✅" : oddsSource === "current" ? "Odds live (updates daily) 📈" : "Odds not available yet"}
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => setPick((p) => ({ ...p, [f.id]: "H" }))}
                      style={btnStyle(pick[f.id] === "H")}
                    >
                      Home {oddsH ? `(${oddsH})` : ""}
                    </button>

                    <button
                      onClick={() => setPick((p) => ({ ...p, [f.id]: "D" }))}
                      style={btnStyle(pick[f.id] === "D")}
                    >
                      Draw {oddsD ? `(${oddsD})` : ""}
                    </button>

                    <button
                      onClick={() => setPick((p) => ({ ...p, [f.id]: "A" }))}
                      style={btnStyle(pick[f.id] === "A")}
                    >
                      Away {oddsA ? `(${oddsA})` : ""}
                    </button>
                  </div>

                  {pick[f.id] && oddsH && oddsD && oddsA && (
                    <small style={{ opacity: 0.7 }}>
                      Potential points if correct:{" "}
                      {Math.round(10 * (pick[f.id] === "H" ? oddsH : pick[f.id] === "D" ? oddsD : oddsA))}
                    </small>
                  )}

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <label>
                      Home goals (optional)
                      <input
                        value={homeGoals[f.id] ?? ""}
                        onChange={(e) => setHomeGoals((h) => ({ ...h, [f.id]: e.target.value }))}
                        inputMode="numeric"
                        style={inputStyle}
                        placeholder="2"
                      />
                    </label>

                    <label>
                      Away goals (optional)
                      <input
                        value={awayGoals[f.id] ?? ""}
                        onChange={(e) => setAwayGoals((a) => ({ ...a, [f.id]: e.target.value }))}
                        inputMode="numeric"
                        style={inputStyle}
                        placeholder="1"
                      />
                    </label>

                    <button
                      onClick={() => savePrediction(f)}
                      disabled={!!saving[f.id]}
                      style={saveBtnStyle}
                    >
                      {saving[f.id] ? "Saving..." : "Save prediction"}
                    </button>

                    {msg[f.id] && <span style={{ marginLeft: 6, opacity: 0.85 }}>{msg[f.id]}</span>}
                  </div>

                  <small style={{ opacity: 0.65 }}>
                    Correct score gives +20. Odds lock 24h before kickoff.
                  </small>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function btnStyle(active: boolean) {
  return {
    padding: "8px 12px",
    borderRadius: 10,
    border: active ? "1px solid rgba(255,255,255,0.45)" : "1px solid rgba(255,255,255,0.2)",
    background: active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
    cursor: "pointer",
  } as const;
}

const inputStyle = {
  width: 120,
  padding: 10,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  marginLeft: 8,
} as const;

const saveBtnStyle = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.08)",
  cursor: "pointer",
} as const;

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
