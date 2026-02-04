"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type FixtureRow = {
  id: string;
  kickoff_time: string;
  home_team: string;
  away_team: string;
  status: string;
};

type Pick = "H" | "D" | "A";

const GLOBAL_LEAGUE_ID = process.env.NEXT_PUBLIC_GLOBAL_LEAGUE_ID!;

export default function PlayPage() {
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [pick, setPick] = useState<Record<string, Pick | "">>({});
  const [homeGoals, setHomeGoals] = useState<Record<string, string>>({});
  const [awayGoals, setAwayGoals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr(null);

      const nowIso = new Date().toISOString();

      const { data, error } = await supabase
        .from("fixtures")
        .select("id,kickoff_time,home_team,away_team,status,odds_home,odds_draw,odds_away,odds_locked_at")
        .gte("kickoff_time", nowIso)
        .order("kickoff_time", { ascending: true })
        .limit(10);
      

      if (error) {
        setErr(error.message);
        setFixtures([]);
      } else {
        setFixtures((data ?? []) as FixtureRow[]);
      }

      setLoading(false);
    }

    load();
  }, []);

  function validate(fixtureId: string) {
    const p = pick[fixtureId];
    const hg = Number(homeGoals[fixtureId]);
    const ag = Number(awayGoals[fixtureId]);

    if (!p) return "Pick Home / Draw / Away first.";
    if (!Number.isInteger(hg) || hg < 0) return "Home goals must be 0 or more.";
    if (!Number.isInteger(ag) || ag < 0) return "Away goals must be 0 or more.";

    if (p === "H" && !(hg > ag)) return "Home pick requires home goals > away goals.";
    if (p === "A" && !(ag > hg)) return "Away pick requires away goals > home goals.";
    if (p === "D" && hg !== ag) return "Draw pick requires equal goals.";

    return null;
  }

  async function savePrediction(fixtureId: string) {
    setMsg((m) => ({ ...m, [fixtureId]: "" }));

    const validation = validate(fixtureId);
    if (validation) {
      setMsg((m) => ({ ...m, [fixtureId]: validation }));
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setMsg((m) => ({ ...m, [fixtureId]: "Log in to submit predictions." }));
      return;
    }

    setSaving((s) => ({ ...s, [fixtureId]: true }));

    const payload = {
      league_id: GLOBAL_LEAGUE_ID,
      fixture_id: fixtureId,
      user_id: user.id,
      pick: pick[fixtureId],
      pred_home_goals: Number(homeGoals[fixtureId]),
      pred_away_goals: Number(awayGoals[fixtureId]),
    };

    const { error } = await supabase.from("predictions").upsert(payload, {
      onConflict: "league_id,fixture_id,user_id",
    });

    setSaving((s) => ({ ...s, [fixtureId]: false }));

    if (error) setMsg((m) => ({ ...m, [fixtureId]: `Error: ${error.message}` }));
    else setMsg((m) => ({ ...m, [fixtureId]: "Saved ✅" }));
  }

  return (
    <main style={{ padding: 24, maxWidth: 950, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Play</h1>
      <p style={{ opacity: 0.75, marginBottom: 20 }}>
        You’re playing in the Global League automatically.
      </p>

      {loading && <p>Loading fixtures…</p>}
      {err && <p style={{ color: "crimson" }}>Error: {err}</p>}

      {!loading && !err && (
        <div style={{ display: "grid", gap: 14 }}>
          {fixtures.map((f) => (
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
                Kickoff: {formatKickoff(f.kickoff_time)} • Status: {f.status}
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => setPick((p) => ({ ...p, [f.id]: "H" }))} style={btnStyle(pick[f.id] === "H")}>Home</button>
                  <button onClick={() => setPick((p) => ({ ...p, [f.id]: "D" }))} style={btnStyle(pick[f.id] === "D")}>Draw</button>
                  <button onClick={() => setPick((p) => ({ ...p, [f.id]: "A" }))} style={btnStyle(pick[f.id] === "A")}>Away</button>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <label>
                    Home goals
                    <input
                      value={homeGoals[f.id] ?? ""}
                      onChange={(e) => setHomeGoals((h) => ({ ...h, [f.id]: e.target.value }))}
                      inputMode="numeric"
                      style={inputStyle}
                      placeholder="2"
                    />
                  </label>

                  <label>
                    Away goals
                    <input
                      value={awayGoals[f.id] ?? ""}
                      onChange={(e) => setAwayGoals((a) => ({ ...a, [f.id]: e.target.value }))}
                      inputMode="numeric"
                      style={inputStyle}
                      placeholder="1"
                    />
                  </label>

                  <button
                    onClick={() => savePrediction(f.id)}
                    disabled={!!saving[f.id]}
                    style={saveBtnStyle}
                  >
                    {saving[f.id] ? "Saving..." : "Save prediction"}
                  </button>

                  {msg[f.id] && <span style={{ marginLeft: 6, opacity: 0.85 }}>{msg[f.id]}</span>}
                </div>

                <small style={{ opacity: 0.65 }}>
                  Pick H/D/A + a consistent exact score. (Odds + points next.)
                </small>
              </div>
            </div>
          ))}
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
  width: 90,
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
