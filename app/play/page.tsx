"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { potentialPoints } from "@/lib/scoring/points";

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

/**  List upcoming fixtures for current gameweek, pre-fill existing predictions, save new/updated predictions. */
export default function PlayPage() {
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Home/away goal inputs, saving flag, status message
  const [homeGoals, setHomeGoals] = useState<Record<string, string>>({});
  const [awayGoals, setAwayGoals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [gw, setGw] = useState<number | null>(null);

  /** Convert predicted score to outcome. H = home win, A = away win, D = draw. */
  function derivedPick(hg: number, ag: number): Pick | null {
    if (hg > ag) return "H";
    if (ag > hg) return "A";
    return "D";
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr(null);

      const nowIso = new Date().toISOString();

      // Find the next gameweek
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

      // Load all fixtures for ucoming gameweek with odds 
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
        setLoading(false);
        return;
      }

      const fixtureList = (fx ?? []) as FixtureRow[];
      setFixtures(fixtureList);

      // Load user's existing predictions for these fixtures to pre-fill the form
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token && fixtureList.length > 0) {
        const fixtureIds = fixtureList.map((f) => f.id).join(",");
        try {
          const res = await fetch(
            `/api/predictions/for-fixtures?fixtureIds=${encodeURIComponent(fixtureIds)}`,
            { headers: { Authorization: `Bearer ${session.access_token}` } }
          );
          const data = await res.json();
          if (res.ok && Array.isArray(data.predictions)) {
            const home: Record<string, string> = {};
            const away: Record<string, string> = {};
            for (const p of data.predictions) {
              if (p.fixture_id != null && (p.pred_home_goals != null || p.pred_away_goals != null)) {
                home[p.fixture_id] = String(p.pred_home_goals ?? "");
                away[p.fixture_id] = String(p.pred_away_goals ?? "");
              }
            }
            if (Object.keys(home).length > 0) setHomeGoals((prev) => ({ ...prev, ...home }));
            if (Object.keys(away).length > 0) setAwayGoals((prev) => ({ ...prev, ...away }));
          }
        } catch {
          // Non-fatal: form stays empty
        }
      }

      setLoading(false);
    }

    load();
  }, []);

  function validate(fixtureId: string) {
    const hgStr = homeGoals[fixtureId];
    const agStr = awayGoals[fixtureId];

    if ((hgStr ?? "") === "" || (agStr ?? "") === "") return "Enter home and away goals.";

    const hg = Number(hgStr);
    const ag = Number(agStr);

    if (!Number.isInteger(hg) || hg < 0) return "Home goals must be 0 or more.";
    if (!Number.isInteger(ag) || ag < 0) return "Away goals must be 0 or more.";

    return null;
  }

  /** Validate, then POST to /api/predictions/submit with user id, fixture id, pick, and score. */
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

    const hg = Number(homeGoals[fixture.id]);
    const ag = Number(awayGoals[fixture.id]);
    const p = derivedPick(hg, ag)!;

    const payload = {
      userId: user.id,
      fixtureId: fixture.id,
      pick: p,
      predHomeGoals: hg,
      predAwayGoals: ag,
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

          // Show locked odds once set. Otherwise show "current" live odds 
          const oddsSource = locked
            ? "locked"
            : (f.odds_home_current != null && f.odds_draw_current != null && f.odds_away_current != null)
              ? "current"
              : "none";
          const oddsH = locked ? f.odds_home : f.odds_home_current;
          const oddsD = locked ? f.odds_draw : f.odds_draw_current;
          const oddsA = locked ? f.odds_away : f.odds_away_current;
          const book = locked ? null : f.odds_current_bookmaker;

            return (
              <div
                key={f.id}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                {/* Odds: above the match line */}
                <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 8, display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem" }}>
                  {oddsH != null && oddsD != null && oddsA != null ? (
                    <>
                      <span>Home <strong>{oddsH.toFixed(2)}</strong></span>
                      <span>Draw <strong>{oddsD.toFixed(2)}</strong></span>
                      <span>Away <strong>{oddsA.toFixed(2)}</strong></span>
                      <span style={{ opacity: 0.7 }}>
                        {locked ? "· Locked ✅" : oddsSource === "current" ? "· Live 📈" : ""}
                      </span>
                    </>
                  ) : (
                    <span style={{ opacity: 0.7 }}>Odds not available yet</span>
                  )}
                </div>

                {/* One line: HomeTeam [input] vs [input] AwayTeam [Save] */}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, rowGap: 10 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, minWidth: 0 }}>{f.home_team}</span>
                  <input
                    value={homeGoals[f.id] ?? ""}
                    onChange={(e) => setHomeGoals((h) => ({ ...h, [f.id]: e.target.value }))}
                    inputMode="numeric"
                    style={scoreInputStyle}
                    placeholder="0"
                    aria-label="Home score"
                  />
                  <span style={{ opacity: 0.7, fontWeight: 600 }}>vs</span>
                  <input
                    value={awayGoals[f.id] ?? ""}
                    onChange={(e) => setAwayGoals((a) => ({ ...a, [f.id]: e.target.value }))}
                    inputMode="numeric"
                    style={scoreInputStyle}
                    placeholder="0"
                    aria-label="Away score"
                  />
                  <span style={{ fontSize: 18, fontWeight: 700, minWidth: 0 }}>{f.away_team}</span>
                  <button
                    onClick={() => savePrediction(f)}
                    disabled={!!saving[f.id]}
                    style={saveBtnStyle}
                  >
                    {saving[f.id] ? "Saving..." : "Save prediction"}
                  </button>
                  {msg[f.id] && <span style={{ opacity: 0.85 }}>{msg[f.id]}</span>}
                </div>

                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", alignItems: "center" }}>
                  <span style={{ opacity: 0.7, fontSize: 13 }}>
                    Kickoff: {formatKickoff(f.kickoff_time)} · {f.status}
                  </span>
                  {(() => {
                    const hgStr = homeGoals[f.id];
                    const agStr = awayGoals[f.id];
                    const hasBoth = (hgStr ?? "") !== "" && (agStr ?? "") !== "";
                    const hg = Number(hgStr);
                    const ag = Number(agStr);
                    const valid = hasBoth && Number.isInteger(hg) && hg >= 0 && Number.isInteger(ag) && ag >= 0;
                    const p = valid ? derivedPick(hg, ag) : null;
                    const outcomeLabel = p === "H" ? "Home win" : p === "A" ? "Away win" : "Draw";
                    const oddsForPick = p === "H" ? oddsH : p === "D" ? oddsD : oddsA;
                    const { resultPoints, exactScoreBonus } = oddsForPick != null ? potentialPoints(oddsForPick) : { resultPoints: 0, exactScoreBonus: 0 };
                    return valid && p && oddsH != null && oddsD != null && oddsA != null ? (
                      <span style={{ opacity: 0.8, fontSize: 13 }}>
                        Your prediction: {hg}–{ag} ({outcomeLabel}) · Potential pts: {resultPoints} (correct result)
                        {exactScoreBonus > 0 && ` · Exact score: +${exactScoreBonus}`}
                      </span>
                    ) : null;
                  })()}
                </div>

                <small style={{ opacity: 0.6, fontSize: 12, marginTop: 4, display: "block" }}>
                  Points: correct result = 10×locked odds − 10; exact score = 1.5× that. Odds lock 24h before kickoff.
                </small>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

const scoreInputStyle = {
  width: 48,
  padding: "8px 6px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontSize: 16,
  fontWeight: 600,
  textAlign: "center" as const,
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
