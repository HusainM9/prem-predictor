"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";

type LogEntry = { time: string; action: string; ok: boolean; text: string };

type FixtureOption = { id: string; home_team: string; away_team: string; status: string; home_goals: number | null; away_goals: number | null; is_stuck?: boolean };
type ReportStatusFilter = "all" | "open" | "reviewed" | "resolved" | "dismissed";
type ReportScopeFilter = "all" | "general" | "league";
type ReportStatusValue = "open" | "reviewed" | "resolved" | "dismissed";

type AdminTab = "tools" | "chat";
type AdminChatReport = {
  id: string;
  message_id: string;
  reporter_user_id: string;
  reported_user_id: string;
  league_id: string | null;
  league_name: string | null;
  scope: "general" | "league";
  reason: string | null;
  status: ReportStatusValue;
  created_at: string;
  message_snapshot: {
    message_text: string | null;
    sender_display_name: string | null;
    reporter_display_name: string | null;
  } | null;
};

function SetResultForm({
  run,
  loading,
}: {
  run: (action: string, method: "GET" | "POST", path: string, body?: object) => void;
  loading: string | null;
}) {
  const [gameweek, setGameweek] = useState("26");
  const [fixtures, setFixtures] = useState<FixtureOption[]>([]);
  const [loadingFixtures, setLoadingFixtures] = useState(false);
  const [fixtureId, setFixtureId] = useState("");
  const [homeGoals, setHomeGoals] = useState("");
  const [awayGoals, setAwayGoals] = useState("");

  async function loadFixtures() {
    const gw = gameweek.trim();
    if (!gw) return;
    setLoadingFixtures(true);
    try {
      const res = await fetch(`/api/admin/fixtures?gameweek=${encodeURIComponent(gw)}`, { credentials: "include" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.fixtures)) {
        setFixtures(data.fixtures);
        if (data.fixtures.length > 0 && !fixtureId) setFixtureId(data.fixtures[0].id);
      }
    } finally {
      setLoadingFixtures(false);
    }
  }

  const canSubmit = fixtureId && homeGoals.trim() !== "" && awayGoals.trim() !== "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="number"
          min={1}
          placeholder="Gameweek"
          value={gameweek}
          onChange={(e) => setGameweek(e.target.value)}
          style={{ width: 72, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
        />
        <button type="button" onClick={loadFixtures} disabled={loadingFixtures} style={btnStyle}>
          {loadingFixtures ? "Loading…" : "Load fixtures"}
        </button>
      </div>
      {fixtures.length > 0 && (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            Fixture
            <select
              value={fixtureId}
              onChange={(e) => setFixtureId(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit", maxWidth: 400 }}
            >
              {fixtures.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.home_team} vs {f.away_team} {f.status === "Finished" ? `(${f.home_goals ?? "?"}-${f.away_goals ?? "?"})` : ""}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Home
              <input
                type="number"
                min={0}
                value={homeGoals}
                onChange={(e) => setHomeGoals(e.target.value)}
                style={{ width: 56, padding: "8px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Away
              <input
                type="number"
                min={0}
                value={awayGoals}
                onChange={(e) => setAwayGoals(e.target.value)}
                style={{ width: 56, padding: "8px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={!canSubmit || !!loading}
              onClick={() =>
                run(
                  "Update score only",
                  "POST",
                  "/api/admin/update-fixture-result",
                  { fixtureId, homeGoals: Number(homeGoals), awayGoals: Number(awayGoals) }
                )
              }
              style={btnStyle}
            >
              Update score only (live)
            </button>
            <button
              type="button"
              disabled={!canSubmit || !!loading}
              onClick={() =>
                run(
                  "Set result & score predictions",
                  "POST",
                  "/api/admin/settle-fixtures",
                  { fixtureId, homeGoals: Number(homeGoals), awayGoals: Number(awayGoals) }
                )
              }
              style={btnStyle}
            >
              Set result & score predictions
            </button>
          </div>
          <p style={{ fontSize: 12, opacity: 0.65 }}>
            &quot;Update score only&quot; updates the fixture so /matches shows the score. &quot;Set result&quot; also marks the match finished and scores all predictions.
          </p>
        </>
      )}
    </div>
  );
}

function FixtureScheduleOverrideForm({
  run,
  loading,
}: {
  run: (action: string, method: "GET" | "POST", path: string, body?: object) => void;
  loading: string | null;
}) {
  const [fixtureId, setFixtureId] = useState("");
  const [status, setStatus] = useState("");
  const [gameweek, setGameweek] = useState("");
  const [kickoffTime, setKickoffTime] = useState("");
  const [includeOnPlay, setIncludeOnPlay] = useState(false);
  const [shouldSetIncludeOnPlay, setShouldSetIncludeOnPlay] = useState(false);
  const [clearScores, setClearScores] = useState(true);

  const hasAnyUpdate =
    status.trim() !== "" ||
    gameweek.trim() !== "" ||
    kickoffTime.trim() !== "" ||
    shouldSetIncludeOnPlay ||
    clearScores;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Fixture ID (UUID)"
          value={fixtureId}
          onChange={(e) => setFixtureId(e.target.value)}
          style={{ width: 280, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
        />
        <button
          type="button"
          disabled={!fixtureId.trim() || !!loading}
          onClick={() =>
            run("Mark fixture postponed", "POST", "/api/admin/update-fixture", {
              fixtureId: fixtureId.trim(),
              status: "postponed",
              include_on_play_page: false,
              clear_scores: true,
            })
          }
          style={btnStyle}
        >
          {loading === "Mark fixture postponed" ? "…" : "Mark postponed now"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ padding: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
        >
          <option value="">Status (optional)</option>
          <option value="scheduled">scheduled</option>
          <option value="in_play">in_play</option>
          <option value="finished">finished</option>
          <option value="postponed">postponed</option>
        </select>
        <input
          type="number"
          min={1}
          placeholder="Gameweek (optional)"
          value={gameweek}
          onChange={(e) => setGameweek(e.target.value)}
          style={{ width: 180, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
        />
        <input
          type="datetime-local"
          value={kickoffTime}
          onChange={(e) => setKickoffTime(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
        />
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={shouldSetIncludeOnPlay} onChange={(e) => setShouldSetIncludeOnPlay(e.target.checked)} />
          Set include_on_play_page
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, opacity: shouldSetIncludeOnPlay ? 1 : 0.6 }}>
          <input
            type="checkbox"
            checked={includeOnPlay}
            onChange={(e) => setIncludeOnPlay(e.target.checked)}
            disabled={!shouldSetIncludeOnPlay}
          />
          include_on_play_page = true
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={clearScores} onChange={(e) => setClearScores(e.target.checked)} />
          Clear scores
        </label>
      </div>

      <div>
        <button
          type="button"
          disabled={!fixtureId.trim() || !hasAnyUpdate || !!loading}
          onClick={() => {
            const body: Record<string, unknown> = { fixtureId: fixtureId.trim() };
            if (status.trim()) body.status = status.trim();
            if (gameweek.trim()) body.gameweek = Number(gameweek);
            if (kickoffTime.trim()) body.kickoff_time = new Date(kickoffTime).toISOString();
            if (shouldSetIncludeOnPlay) body.include_on_play_page = includeOnPlay;
            if (clearScores) body.clear_scores = true;
            run("Update fixture schedule", "POST", "/api/admin/update-fixture", body);
          }}
          style={btnStyle}
        >
          {loading === "Update fixture schedule" ? "Saving…" : "Apply fixture update"}
        </button>
      </div>
    </div>
  );
}

type PlayPageFixture = { id: string; home_team: string; away_team: string; gameweek: number; kickoff_time: string; status: string };

function PlayPageFixturesForm({
  run,
  loading,
}: {
  run: (action: string, method: "GET" | "POST", path: string, body?: object) => void;
  loading: string | null;
}) {
  const [fixtureId, setFixtureId] = useState("");
  const [list, setList] = useState<PlayPageFixture[]>([]);
  const [listLoading, setListLoading] = useState(false);

  async function loadList() {
    setListLoading(true);
    try {
      const res = await fetch("/api/admin/play-fixtures", { credentials: "include" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.fixtures)) setList(data.fixtures);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    loadList();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Fixture ID (UUID)"
          value={fixtureId}
          onChange={(e) => setFixtureId(e.target.value)}
          style={{ width: 280, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
        />
        <button
          type="button"
          disabled={!fixtureId.trim() || !!loading}
          onClick={() => {
            run("Add to Play page", "POST", "/api/admin/play-fixtures", { fixtureId: fixtureId.trim() });
            setFixtureId("");
            setTimeout(loadList, 500);
          }}
          style={btnStyle}
        >
          {loading === "Add to Play page" ? "…" : "Add to Play page"}
        </button>
        <button type="button" onClick={loadList} disabled={listLoading} style={btnStyle}>
          {listLoading ? "…" : "Refresh list"}
        </button>
      </div>
      {list.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
          {list.map((f) => (
            <li key={f.id} style={{ marginBottom: 4 }}>
              {f.home_team} vs {f.away_team} (GW {f.gameweek}) — {f.id.slice(0, 8)}…
              <button
                type="button"
                onClick={() => {
                  run("Remove from Play page", "POST", "/api/admin/play-fixtures", { fixtureId: f.id, remove: true });
                  setTimeout(loadList, 500);
                }}
                disabled={!!loading}
                style={{ marginLeft: 8, fontSize: 12, ...btnStyle }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const SEASON_2025_26_START = "2025-08-01";
const SEASON_2025_26_END = "2026-05-31";

function ImportFixturesForm({
  run,
  loading,
}: {
  run: (action: string, method: "GET" | "POST", path: string, body?: object) => void;
  loading: string | null;
}) {
  const now = new Date();
  const defaultFrom = isoDate(now);
  const defaultTo = isoDate(new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000));
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);

  const doImport = () => {
    const from = dateFrom.trim() || defaultFrom;
    const to = dateTo.trim() || defaultTo;
    const path = `/api/admin/import-fixtures?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`;
    run("Import fixtures", "GET", path);
  };

  const doImportFullSeason = () => {
    const path = `/api/admin/import-fixtures?dateFrom=${encodeURIComponent(SEASON_2025_26_START)}&dateTo=${encodeURIComponent(SEASON_2025_26_END)}`;
    run("Import full season 2025/26", "GET", path);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
          To
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
          />
        </label>
        <button type="button" onClick={doImport} disabled={!!loading} style={btnStyle}>
          {loading === "Import fixtures" ? "Importing…" : "Import fixtures from API"}
        </button>
        <button
          type="button"
          onClick={doImportFullSeason}
          disabled={!!loading}
          style={{ ...btnStyle, borderColor: "rgba(255,255,255,0.35)" }}
          title={`Fetches all PL fixtures from ${SEASON_2025_26_START} to ${SEASON_2025_26_END}. Safe to run multiple times (upserts by external_id).`}
        >
          {loading === "Import full season 2025/26" ? "Importing…" : "Import full season (2025/26)"}
        </button>
      </div>
      <p style={{ fontSize: 12, opacity: 0.65, margin: 0 }}>
        Full season: one click to backfill GW 1–38. Uses same API; upsert by external_id so existing fixtures are updated, not duplicated.
      </p>
    </div>
  );
}

function AddLeagueMemberForm({
  run,
  loading,
}: {
  run: (action: string, method: "GET" | "POST", path: string, body?: object) => void;
  loading: string | null;
}) {
  const [email, setEmail] = useState("");
  const [leagueId, setLeagueId] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="email"
          placeholder="User email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: 220, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
        />
        <input
          type="text"
          placeholder="League ID (UUID)"
          value={leagueId}
          onChange={(e) => setLeagueId(e.target.value)}
          style={{ width: 320, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
        />
        <button
          type="button"
          disabled={!!loading || !email.trim() || !leagueId.trim()}
          onClick={() =>
            run("Add to league", "POST", "/api/admin/add-league-member", {
              email: email.trim(),
              leagueId: leagueId.trim(),
            })
          }
          style={btnStyle}
        >
          {loading === "Add to league" ? "…" : "Add user to league"}
        </button>
      </div>
    </div>
  );
}

function chipStyle(active: boolean): CSSProperties {
  return {
    padding: "10px 16px",
    borderRadius: 999,
    border: active ? "1px solid rgba(34, 197, 94, 0.55)" : "1px solid rgba(255,255,255,0.2)",
    background: active ? "rgba(34, 197, 94, 0.18)" : "rgba(255,255,255,0.06)",
    color: "inherit",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 600 : 500,
  };
}

function ChatModerationWorkspace({ onQueueChanged }: { onQueueChanged?: () => void }) {
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>("open");
  const [scopeFilter, setScopeFilter] = useState<ReportScopeFilter>("general");
  const [reports, setReports] = useState<AdminChatReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState("");

  const loadReports = useCallback(
    async (next?: { status?: ReportStatusFilter; scope?: ReportScopeFilter }) => {
      const status = next?.status ?? statusFilter;
      const scope = next?.scope ?? scopeFilter;
      setLoadingReports(true);
      setErrorText("");
      try {
        const params = new URLSearchParams();
        params.set("status", status);
        params.set("scope", scope);
        params.set("limit", "250");
        const res = await fetch(`/api/admin/chat-reports?${params.toString()}`, { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrorText(typeof data.error === "string" ? data.error : "Failed to load reports.");
          return;
        }
        setReports(Array.isArray(data.reports) ? (data.reports as AdminChatReport[]) : []);
      } finally {
        setLoadingReports(false);
      }
    },
    [scopeFilter, statusFilter]
  );

  async function updateStatus(reportId: string, status: ReportStatusValue) {
    setUpdatingReportId(reportId);
    setErrorText("");
    try {
      const res = await fetch("/api/admin/chat-reports", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorText(typeof data.error === "string" ? data.error : "Failed to update report status.");
        return;
      }
      await loadReports();
      onQueueChanged?.();
    } finally {
      setUpdatingReportId(null);
    }
  }

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Chat moderation</h2>
          <p style={{ margin: 0, fontSize: 14, opacity: 0.78, lineHeight: 1.45 }}>
            Review reports from <strong>global</strong> and <strong>league</strong> chat. Defaults to{" "}
            <strong>global chat</strong> and <strong>open</strong> tickets. Use the chips to widen the queue; refresh
            after you change status.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.85, minWidth: 48 }}>Scope</span>
          {(
            [
              { value: "general" as const, label: "Global chat" },
              { value: "league" as const, label: "League chat" },
              { value: "all" as const, label: "All" },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setScopeFilter(value);
                void loadReports({ scope: value });
              }}
              style={chipStyle(scopeFilter === value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.85, minWidth: 48 }}>Status</span>
          {(
            [
              { value: "open" as const, label: "Open" },
              { value: "all" as const, label: "All" },
              { value: "reviewed" as const, label: "Reviewed" },
              { value: "resolved" as const, label: "Resolved" },
              { value: "dismissed" as const, label: "Dismissed" },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setStatusFilter(value);
                void loadReports({ status: value });
              }}
              style={chipStyle(statusFilter === value)}
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={() => void loadReports()} disabled={loadingReports} style={{ ...btnStyle, marginLeft: "auto" }}>
            {loadingReports ? "Loading…" : "Refresh list"}
          </button>
        </div>

        {!loadingReports && statusFilter === "open" && (
          <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
            Showing <strong>{reports.length}</strong> open report{reports.length === 1 ? "" : "s"}
            {scopeFilter === "general" ? " (global chat)" : scopeFilter === "league" ? " (league chat)" : " (all scopes)"}.
          </p>
        )}
      </div>

      {errorText && <p style={{ margin: 0, color: "crimson", fontSize: 14 }}>{errorText}</p>}

      {!loadingReports && reports.length === 0 && (
        <p style={{ margin: 0, fontSize: 15, opacity: 0.8 }}>No reports match these filters.</p>
      )}

      {loadingReports && <p style={{ margin: 0, fontSize: 14, opacity: 0.75 }}>Loading reports…</p>}

      {reports.length > 0 && !loadingReports && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            maxHeight: "min(70vh, 720px)",
            overflowY: "auto",
            paddingRight: 6,
          }}
        >
          {reports.map((report) => (
            <article
              key={report.id}
              style={{
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 12,
                padding: 16,
                background: "rgba(0,0,0,0.18)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.4 }}>
                  <strong>{new Date(report.created_at).toLocaleString()}</strong>
                  <br />
                  <span style={{ opacity: 0.9 }}>
                    {report.scope === "general" ? "Global chat" : "League chat"}
                    {report.scope === "league" && (
                      <>
                        {" "}
                        · {report.league_name ?? report.league_id ?? "Unknown league"}
                      </>
                    )}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    padding: "4px 10px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.08)",
                    alignSelf: "flex-start",
                  }}
                >
                  {report.status}
                </span>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 14 }}>
                <strong>{report.message_snapshot?.reporter_display_name ?? "Reporter"}</strong> reported{" "}
                <strong>{report.message_snapshot?.sender_display_name ?? "User"}</strong>
              </p>
              <div
                style={{
                  margin: "0 0 12px",
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.05)",
                  fontSize: 14,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {report.message_snapshot?.message_text || "[no text snapshot]"}
              </div>
              {report.reason && (
                <p style={{ margin: "0 0 12px", fontSize: 13, opacity: 0.88 }}>
                  <strong>Reason:</strong> {report.reason}
                </p>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  disabled={updatingReportId === report.id || report.status === "reviewed"}
                  onClick={() => void updateStatus(report.id, "reviewed")}
                  style={btnStyle}
                >
                  Mark reviewed
                </button>
                <button
                  type="button"
                  disabled={updatingReportId === report.id || report.status === "resolved"}
                  onClick={() => void updateStatus(report.id, "resolved")}
                  style={btnStyle}
                >
                  Mark resolved
                </button>
                <button
                  type="button"
                  disabled={updatingReportId === report.id || report.status === "dismissed"}
                  onClick={() => void updateStatus(report.id, "dismissed")}
                  style={{ ...btnStyle, background: "rgba(255,255,255,0.06)" }}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  disabled={updatingReportId === report.id || report.status === "open"}
                  onClick={() => void updateStatus(report.id, "open")}
                  style={{ ...btnStyle, background: "rgba(255,255,255,0.04)" }}
                >
                  Re-open
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const fetchOpts = (method: "GET" | "POST", body?: object) => ({
  method,
  credentials: "include" as const,
  headers: body ? { "Content-Type": "application/json" } : undefined,
  body: body ? JSON.stringify(body) : undefined,
});

export default function AdminPage() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [gameweekInput, setGameweekInput] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [secret, setSecret] = useState("");
  const [loginError, setLoginError] = useState("");
  const [adminTab, setAdminTab] = useState<AdminTab>("tools");
  const [openChatReportsCount, setOpenChatReportsCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/verify", fetchOpts("GET"))
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  const refreshOpenChatReportsHint = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/chat-reports?status=open&scope=all&limit=250", {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.reports)) {
        setOpenChatReportsCount(null);
        return;
      }
      setOpenChatReportsCount(data.reports.length);
    } catch {
      setOpenChatReportsCount(null);
    }
  }, []);

  useEffect(() => {
    if (authed === true) void refreshOpenChatReportsHint();
  }, [authed, refreshOpenChatReportsHint]);

  function addLog(action: string, ok: boolean, text: string) {
    setLog((prev) => [
      { time: new Date().toLocaleTimeString(), action, ok, text },
      ...prev.slice(0, 49),
    ]);
  }

  async function run(
    action: string,
    method: "GET" | "POST",
    path: string,
    body?: object
  ) {
    setLoading(action);
    try {
      const res = await fetch(path, fetchOpts(method, body));
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : {};
      const ok = res.ok;
      addLog(action, ok, typeof data === "object" ? JSON.stringify(data, null, 2) : String(data));
    } catch (e: unknown) {
      addLog(action, false, e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError("");
    const res = await fetch("/api/admin/login", fetchOpts("POST", { secret }));
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setLoginError(d.error || "Invalid secret");
      return;
    }
    setAuthed(true);
  }

  if (authed === null) {
    return (
      <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
        <p style={{ opacity: 0.75 }}>Checking access…</p>
      </main>
    );
  }

  if (!authed) {
    return (
      <main style={{ padding: 24, maxWidth: 400, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Admin login</h1>
        <p style={{ opacity: 0.75, marginBottom: 16, fontSize: 14 }}>
          Set ADMIN_SECRET in your env and enter it below.
        </p>
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="password"
            placeholder="Admin secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
          />
          <button type="submit" style={btnStyle}>Continue</button>
          {loginError && <span style={{ color: "crimson", fontSize: 14 }}>{loginError}</span>}
        </form>
      </main>
    );
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", fetchOpts("POST"));
    setAuthed(false);
  }

  const tabBtn = (active: boolean): CSSProperties => ({
    padding: "12px 20px",
    borderRadius: 10,
    border: active ? "1px solid rgba(34, 197, 94, 0.5)" : "1px solid rgba(255,255,255,0.2)",
    background: active ? "rgba(34, 197, 94, 0.15)" : "rgba(255,255,255,0.06)",
    color: "inherit",
    cursor: "pointer",
    fontSize: 15,
    fontWeight: active ? 700 : 500,
    flex: "1 1 200px",
    textAlign: "center" as const,
  });

  return (
    <main
      style={{
        padding: 24,
        maxWidth: adminTab === "chat" ? 980 : 720,
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>Admin</h1>
          <p style={{ opacity: 0.75, fontSize: 14 }}>
            {adminTab === "chat"
              ? "Chat moderation — review reported messages."
              : "Run jobs manually. Sessions expire after 1 hour."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          style={{ ...btnStyle, background: "rgba(255,255,255,0.08)", padding: "8px 14px", fontSize: 14 }}
        >
          Log out
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Admin sections"
        style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={adminTab === "tools"}
          onClick={() => setAdminTab("tools")}
          style={tabBtn(adminTab === "tools")}
        >
          Tools & jobs
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={adminTab === "chat"}
          onClick={() => {
            setAdminTab("chat");
            void refreshOpenChatReportsHint();
          }}
          style={tabBtn(adminTab === "chat")}
        >
          Chat moderation
          {openChatReportsCount != null && openChatReportsCount > 0 ? (
            <span style={{ marginLeft: 8, fontSize: 13, opacity: 0.95 }}>({openChatReportsCount} open)</span>
          ) : null}
        </button>
      </div>

      {adminTab === "chat" ? (
        <ChatModerationWorkspace onQueueChanged={refreshOpenChatReportsHint} />
      ) : null}

      {adminTab === "tools" ? (
        <>
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Set / update result</h2>
        <SetResultForm run={run} loading={loading} />
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Fixture schedule override</h2>
        <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          For postponements/reschedules: mark fixture postponed immediately, then move it to a new kickoff/gameweek when confirmed.
        </p>
        <FixtureScheduleOverrideForm run={run} loading={loading} />
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Score gameweek</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => run("Score gameweek (latest finished)", "POST", "/api/admin/score-gameweek", {})}
            disabled={!!loading}
            style={btnStyle}
          >
            {loading === "Score gameweek (latest finished)" ? "Running…" : "Score current gameweek"}
          </button>
          <span style={{ opacity: 0.8 }}>or</span>
          <input
            type="number"
            min={1}
            placeholder="GW number"
            value={gameweekInput}
            onChange={(e) => setGameweekInput(e.target.value)}
            style={{ width: 80, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit" }}
          />
          <button
            onClick={() =>
              run(
                "Score gameweek " + gameweekInput,
                "POST",
                "/api/admin/score-gameweek",
                { gameweek: Number(gameweekInput) || undefined }
              )
            }
            disabled={!!loading || !gameweekInput.trim()}
            style={btnStyle}
          >
            Score GW {gameweekInput || "…"}
          </button>
          <button
            onClick={() => run("Reset scores for current gameweek", "POST", "/api/admin/score-gameweek", { reset: true })}
            disabled={!!loading}
            style={{ ...btnStyle, marginLeft: 8, fontSize: 12 }}
          >
            {loading === "Reset scores for current gameweek" ? "Resetting…" : "Reset current GW scores"}
          </button>
        </div>
        <p style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>
          Uses the latest gameweek with finished fixtures, or the number you enter.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Import fixtures</h2>
        <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          Fetch fixtures from Football-Data.org for a date range. Needs FOOTBALL_DATA_API_KEY.
        </p>
        <ImportFixturesForm run={run} loading={loading} />
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Standings (Table page)</h2>
        <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          The table page caches standings for 1 hour. Use this to pull fresh data when something important changed.
        </p>
        <button
          onClick={() => run("Refresh standings", "POST", "/api/admin/refresh-standings")}
          disabled={!!loading}
          style={btnStyle}
        >
          {loading === "Refresh standings" ? "Refreshing…" : "Refresh standings cache"}
        </button>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Results (from API)</h2>
        <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          Sync scores from Football-Data.org. Needs FOOTBALL_DATA_API_KEY. Matches fixtures by date and team names.
        </p>
        <button
          onClick={() => run("Sync results", "GET", "/api/admin/sync-results?debug=1")}
          disabled={!!loading}
          style={btnStyle}
        >
          {loading === "Sync results" ? "Syncing…" : "Sync results from API"}
        </button>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Add fixtures to Play page</h2>
        <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          Add a fixture by ID so it appears on the Play page (e.g. rescheduled match from another gameweek). Fixture must already exist in the database.
        </p>
        <PlayPageFixturesForm run={run} loading={loading} />
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Add user to league</h2>
        <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          Add an existing user (by email) to a league. League ID is in the URL when you open a league .
        </p>
        <AddLeagueMemberForm run={run} loading={loading} />
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Odds</h2>
        <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          <strong>Unlock</strong> clears <code style={{ fontSize: 11 }}>odds_locked_at</code> and the locked line on fixtures, and{" "}
          <code style={{ fontSize: 11 }}>locked_odds</code> on predictions, so you can refresh prices and lock again.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => run("Map odds", "GET", "/api/admin/map-odds")}
            disabled={!!loading}
            style={btnStyle}
          >
            {loading === "Map odds" ? "…" : "Map odds"}
          </button>
          <button
            onClick={() => run("Fetch current odds", "POST", "/api/odds/fetch-current")}
            disabled={!!loading}
            style={btnStyle}
          >
            {loading === "Fetch current odds" ? "…" : "Fetch current odds"}
          </button>
          <button
            onClick={() => run("Lock odds (24h window)", "GET", "/api/admin/lock-odds")}
            disabled={!!loading}
            style={btnStyle}
          >
            {loading === "Lock odds (24h window)" ? "…" : "Lock odds"}
          </button>
          <button
            type="button"
            onClick={() =>
              void run("Unlock odds (upcoming)", "POST", "/api/admin/unlock-odds?scope=upcoming")
            }
            disabled={!!loading}
            style={{ ...btnStyle, background: "rgba(220, 120, 80, 0.25)", border: "1px solid rgba(220,120,80,0.45)" }}
          >
            {loading === "Unlock odds (upcoming)" ? "…" : "Unlock odds (upcoming)"}
          </button>
          <button
            type="button"
            onClick={() => {
              const id = typeof window !== "undefined" ? window.prompt("Fixture UUID to unlock")?.trim() : "";
              if (!id) return;
              void run(
                "Unlock odds (one fixture)",
                "POST",
                `/api/admin/unlock-odds?fixtureId=${encodeURIComponent(id)}`
              );
            }}
            disabled={!!loading}
            style={{ ...btnStyle, background: "rgba(220, 120, 80, 0.2)", border: "1px solid rgba(220,120,80,0.35)" }}
          >
            {loading === "Unlock odds (one fixture)" ? "…" : "Unlock one fixture…"}
          </button>
          <button
            type="button"
            onClick={() => {
              const gw = gameweekInput.trim();
              if (!gw) {
                window.alert("Enter a gameweek number in the Score gameweek field above first.");
                return;
              }
              void run(
                `Unlock odds (GW ${gw})`,
                "POST",
                `/api/admin/unlock-odds?season=${encodeURIComponent("2025/26")}&gameweek=${encodeURIComponent(gw)}`
              );
            }}
            disabled={!!loading}
            style={{ ...btnStyle, background: "rgba(220, 120, 80, 0.15)", border: "1px solid rgba(220,120,80,0.3)" }}
          >
            {loading?.startsWith("Unlock odds (GW") ? "…" : "Unlock locked in GW (uses GW # above)"}
          </button>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Log</h2>
        <div
          style={{
            background: "rgba(0,0,0,0.2)",
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            fontFamily: "monospace",
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {log.length === 0 ? (
            <span style={{ opacity: 0.5 }}>Run an action to see results.</span>
          ) : (
            log.map((entry, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <span style={{ opacity: 0.6 }}>{entry.time}</span>{" "}
                <span style={{ color: entry.ok ? "inherit" : "crimson", fontWeight: 600 }}>
                  {entry.action}
                </span>
                <pre style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {entry.text}
                </pre>
              </div>
            ))
          )}
        </div>
      </section>
        </>
      ) : null}
    </main>
  );
}

const btnStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.08)",
  color: "inherit",
  cursor: "pointer",
};
