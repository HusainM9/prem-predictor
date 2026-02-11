"use client";

import { useEffect, useState } from "react";

type TableRow = {
  position: number;
  team: { id: number; name: string; shortName: string; crest?: string };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  form?: string;
};

type StandingsData = {
  competition?: { name: string; code: string };
  season?: { currentMatchday?: number };
  standings?: Array<{ type: string; table: TableRow[] }>;
};

export default function TablePage() {
  const [data, setData] = useState<StandingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/standings")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (d.error) setErr(d.error);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <main style={{ padding: 24 }}><p>Loading table…</p></main>;
  if (err) return <main style={{ padding: 24 }}><p style={{ color: "crimson" }}>Error: {err}</p></main>;

  const totalStanding = data?.standings?.find((s) => s.type === "TOTAL");
  const rows: TableRow[] = totalStanding?.table ?? [];
  const compName = data?.competition?.name ?? "Premier League";
  const matchday = data?.season?.currentMatchday;

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>{compName}</h1>
      <p style={{ opacity: 0.75, marginBottom: 20, fontSize: 14 }}>
        League table {matchday != null ? `· After matchday ${matchday}` : ""}
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
              <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 600 }}>#</th>
              <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 600 }}>Team</th>
              <th style={{ textAlign: "center", padding: "10px 8px", fontWeight: 600 }}>P</th>
              <th style={{ textAlign: "center", padding: "10px 8px", fontWeight: 600 }}>W</th>
              <th style={{ textAlign: "center", padding: "10px 8px", fontWeight: 600 }}>D</th>
              <th style={{ textAlign: "center", padding: "10px 8px", fontWeight: 600 }}>L</th>
              <th style={{ textAlign: "center", padding: "10px 8px", fontWeight: 600 }}>GF</th>
              <th style={{ textAlign: "center", padding: "10px 8px", fontWeight: 600 }}>GA</th>
              <th style={{ textAlign: "center", padding: "10px 8px", fontWeight: 600 }}>GD</th>
              <th style={{ textAlign: "center", padding: "10px 8px", fontWeight: 600 }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.team.id}
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <td style={{ padding: "10px 8px", opacity: 0.9 }}>{row.position}</td>
                <td style={{ padding: "10px 8px", fontWeight: 500 }}>
                  {row.team.crest && (
                    <img
                      src={row.team.crest}
                      alt=""
                      width={20}
                      height={20}
                      style={{ verticalAlign: "middle", marginRight: 8 }}
                    />
                  )}
                  {row.team.shortName || row.team.name}
                </td>
                <td style={{ padding: "10px 8px", textAlign: "center", opacity: 0.9 }}>{row.playedGames}</td>
                <td style={{ padding: "10px 8px", textAlign: "center", opacity: 0.9 }}>{row.won}</td>
                <td style={{ padding: "10px 8px", textAlign: "center", opacity: 0.9 }}>{row.draw}</td>
                <td style={{ padding: "10px 8px", textAlign: "center", opacity: 0.9 }}>{row.lost}</td>
                <td style={{ padding: "10px 8px", textAlign: "center", opacity: 0.9 }}>{row.goalsFor}</td>
                <td style={{ padding: "10px 8px", textAlign: "center", opacity: 0.9 }}>{row.goalsAgainst}</td>
                <td
                  style={{
                    padding: "10px 8px",
                    textAlign: "center",
                    fontWeight: 600,
                    color: row.goalDifference > 0 ? "green" : row.goalDifference < 0 ? "crimson" : undefined,
                  }}
                >
                  {row.goalDifference > 0 ? "+" : ""}
                  {row.goalDifference}
                </td>
                <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700 }}>{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 16, fontSize: 12, opacity: 0.6 }}>
        P = Played, W = Won, D = Draw, L = Lost, GF = Goals for, GA = Goals against, GD = Goal difference, Pts = Points.
      </p>
    </main>
  );
}
