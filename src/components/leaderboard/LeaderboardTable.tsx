"use client";

export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  display_name: string;
  total_points: number;
};

type Props = {
  entries: LeaderboardEntry[];
  currentUserId?: string | null;
  title?: string;
  loading?: boolean;
};

export function LeaderboardTable({ entries, currentUserId, title = "Leaderboard", loading }: Props) {
  if (loading) {
    return (
      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>{title}</h2>
        <p style={{ opacity: 0.8 }}>Loading…</p>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 20, marginBottom: 12 }}>{title}</h2>
      {entries.length === 0 ? (
        <p style={{ opacity: 0.8 }}>No scores yet. Make predictions and wait for results to be settled.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)", textAlign: "left" }}>
              <th style={{ padding: "10px 12px", fontWeight: 600 }}>#</th>
              <th style={{ padding: "10px 12px", fontWeight: 600 }}>User</th>
              <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>Points</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.user_id}
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  backgroundColor: currentUserId && e.user_id === currentUserId ? "rgba(255,255,255,0.06)" : undefined,
                }}
              >
                <td style={{ padding: "10px 12px" }}>{e.rank}</td>
                <td style={{ padding: "10px 12px" }}>
                  {currentUserId && e.user_id === currentUserId ? (
                    <strong>You</strong>
                  ) : (
                    <span style={{ opacity: 0.9 }}>{e.display_name ?? `User ${e.user_id.slice(0, 8)}…`}</span>
                  )}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>{e.total_points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
