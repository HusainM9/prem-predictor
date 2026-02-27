"use client";

import { useEffect, useState } from "react";

type LogEntry = { time: string; action: string; ok: boolean; text: string };

type FixtureOption = { id: string; home_team: string; away_team: string; status: string; home_goals: number | null; away_goals: number | null };

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
      </div>
      <p style={{ fontSize: 12, opacity: 0.65, margin: 0 }}>
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

  useEffect(() => {
    fetch("/api/admin/verify", fetchOpts("GET"))
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

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

  async function handleLogin(e: React.FormEvent) {
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

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>Admin</h1>
          <p style={{ opacity: 0.75, fontSize: 14 }}>
            Run jobs manually. Sessions expire after 1 hour.
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

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Set / update result</h2>
        <SetResultForm run={run} loading={loading} />
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
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Results (from API)</h2>
        <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          Sync scores from Football-Data.org. Needs FOOTBALL_DATA_API_KEY. Matches fixtures by date and team names.
        </p>
        <button
          onClick={() => run("Sync results", "GET", "/api/admin/sync-results")}
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.08)",
  color: "inherit",
  cursor: "pointer",
};
