"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type FixtureInfo = {
  home_team: string;
  away_team: string;
  kickoff_time: string;
  gameweek: number;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
};

type HistoryItem = {
  prediction_id: string;
  fixture_id: string;
  pred_home_goals: number;
  pred_away_goals: number;
  pick: string;
  points_awarded: number;
  bonus_points: number;
  total_points: number;
  settled_at: string | null;
  submitted_at: string;
  fixture: FixtureInfo | null;
};

type ByGameweek = Record<
  string,
  { predictions: HistoryItem[]; total_points: number }
>;

function formatKickoff(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const GAMEWEEK_OPTIONS = Array.from({ length: 38 }, (_, i) => i + 1); // 1–38

export default function HistoryPage() {
  const [predictions, setPredictions] = useState<HistoryItem[]>([]);
  const [byGameweek, setByGameweek] = useState<ByGameweek>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [gameweekFilter, setGameweekFilter] = useState<string>("ALL");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (!cancelled) {
          setErr("Please log in to see your history.");
          setLoading(false);
        }
        return;
      }
      const params = new URLSearchParams();
      if (gameweekFilter !== "" && gameweekFilter !== "ALL") {
        const n = Number(gameweekFilter);
        if (Number.isInteger(n) && n >= 1 && n <= 38) params.set("gameweek", String(n));
      }
      const res = await fetch(`/api/predictions/history?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setErr(data.error ?? res.statusText);
        setPredictions([]);
        setByGameweek({});
      } else {
        setPredictions(data.predictions ?? []);
        setByGameweek(data.by_gameweek ?? {});
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameweekFilter]);

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/" style={{ opacity: 0.9, marginRight: 12 }}>Home</Link>
        <Link href="/play" style={{ opacity: 0.9, marginRight: 12 }}>Play</Link>
        <Link href="/matches" style={{ opacity: 0.9, marginRight: 12 }}>Matches</Link>
        <Link href="/leaderboard" style={{ opacity: 0.9 }}>Leaderboard</Link>
      </div>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>My prediction history</h1>
      <p style={{ opacity: 0.8, marginBottom: 12 }}>
        Your past predictions and points per fixture. Points appear after results are settled.
      </p>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        Gameweek
        <select
          value={gameweekFilter}
          onChange={(e) => setGameweekFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit", minWidth: 100 }}
        >
          <option value="ALL">ALL</option>
          {GAMEWEEK_OPTIONS.map((gw) => (
            <option key={gw} value={String(gw)}>
              {gw}
            </option>
          ))}
        </select>
      </label>
      {err && <p style={{ color: "crimson", marginBottom: 12 }}>{err}</p>}
      {loading && <p style={{ opacity: 0.8 }}>Loading…</p>}
      {!loading && !err && (
        <>
          {(Object.keys(byGameweek).length > 0 || (gameweekFilter !== "ALL" && gameweekFilter !== "")) && (
            <section style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, marginBottom: 8 }}>
                Points by gameweek{gameweekFilter !== "ALL" && gameweekFilter !== "" ? ` (GW ${gameweekFilter})` : ""}
              </h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {(gameweekFilter === "ALL" || gameweekFilter === ""
                  ? Object.entries(byGameweek).sort(([a], [b]) => Number(b) - Number(a))
                  : (() => {
                      const gwData = byGameweek[gameweekFilter];
                      return [[gameweekFilter, gwData ?? { predictions: [], total_points: 0 }]] as [string, { predictions: HistoryItem[]; total_points: number }][];
                    })()
                ).map(([gw, { total_points, predictions: preds }]) => (
                  <li
                    key={gw}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <span>Gameweek {gw}</span>
                    <strong>{total_points} pts</strong> ({preds.length} prediction{preds.length !== 1 ? "s" : ""})
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>
              {gameweekFilter === "ALL" || gameweekFilter === "" ? "All predictions" : `Predictions (GW ${gameweekFilter})`}
            </h2>
            {predictions.length === 0 ? (
              <p style={{ opacity: 0.8 }}>No predictions yet. Make predictions on the Play page.</p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {predictions.map((p) => (
                  <div
                    key={p.prediction_id}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      padding: 14,
                    }}
                  >
                    {p.fixture && (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                          <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{p.fixture.home_team}</span>
                          <span style={{ fontSize: 14, opacity: 0.9 }}>
                            Your prediction: {p.pred_home_goals}–{p.pred_away_goals}
                            {p.fixture.status === "Finished" &&
                              p.fixture.home_goals != null &&
                              p.fixture.away_goals != null && (
                                <> · Result: {p.fixture.home_goals}–{p.fixture.away_goals}</>
                              )}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, fontWeight: 600, textAlign: "right" }}>{p.fixture.away_team}</span>
                        </div>
                        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
                          GW{p.fixture.gameweek} · {formatKickoff(p.fixture.kickoff_time)}
                          {p.settled_at && (
                            <span style={{ marginLeft: 8 }}>
                              · <strong>{p.total_points} pts</strong>
                              {p.bonus_points > 0 && (
                                <span style={{ opacity: 0.9 }}> (incl. {p.bonus_points} bonus)</span>
                              )}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                    {!p.fixture && (
                      <div style={{ opacity: 0.8 }}>
                        Fixture {p.fixture_id} · Predicted {p.pred_home_goals}–{p.pred_away_goals}
                        {p.settled_at && ` · ${p.total_points} pts`}
                      </div>
                    )}
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
