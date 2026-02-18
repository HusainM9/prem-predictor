"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { validateLeagueName } from "@/lib/name-validation";

type LeagueRow = { id: string; name: string };

export default function LeaguesPage() {
  const router = useRouter();
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<{ name: string; invite_code: string; id: string } | null>(null);

  const [joinCode, setJoinCode] = useState("");
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [joinMsg, setJoinMsg] = useState<string | null>(null);

  const loadLeagues = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: members, error: memErr } = await supabase
      .from("league_members")
      .select("league_id")
      .eq("user_id", session.user.id);

    if (memErr) {
      setErr(memErr.message);
      setLeagues([]);
      return;
    }

    if (!members?.length) {
      setLeagues([]);
      return;
    }

    const leagueIds = [...new Set(members.map((m) => m.league_id))];
    const { data: leagueRows, error: leagueErr } = await supabase
      .from("leagues")
      .select("id, name")
      .in("id", leagueIds)
      .order("name");

    if (leagueErr) {
      setErr(leagueErr.message);
      setLeagues([]);
    } else {
      setLeagues((leagueRows ?? []) as LeagueRow[]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session) {
        router.replace("/");
        setLoading(false);
        return;
      }
      loadLeagues().finally(() => {
        if (!cancelled) setLoading(false);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [router, loadLeagues]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim() || createSubmitting) return;
    const name = createName.trim();
    const validation = validateLeagueName(name);
    if (!validation.valid) {
      setErr(validation.error);
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setErr("Please log in to create a league.");
      return;
    }
    setCreateSubmitting(true);
    setErr(null);
    setJoinMsg(null);
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: createName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Failed to create league");
        return;
      }
      setCreateSuccess({ name: data.name, invite_code: data.invite_code, id: data.id });
      setCreateName("");
      await loadLeagues();
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim() || joinSubmitting) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setErr("Please log in to join a league.");
      return;
    }
    setJoinSubmitting(true);
    setErr(null);
    setCreateSuccess(null);
    try {
      const res = await fetch("/api/leagues/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ code: joinCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Failed to join league");
        return;
      }
      setJoinMsg(data.name ? `Joined "${data.name}".` : "Joined league.");
      setJoinCode("");
      await loadLeagues();
    } finally {
      setJoinSubmitting(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ marginBottom: 18, display: "flex", gap: 12, alignItems: "center" }}>
        <Link href="/" style={{ opacity: 0.85, fontSize: 14 }}>← Home</Link>
        <Link href="/leaderboard" style={{ opacity: 0.85, fontSize: 14 }}>Global leaderboard</Link>
      </div>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Leagues</h1>
      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        Create a private league or join one with a 6-character code. One prediction on Play applies to every league unless otherwise specified.
      </p>

      {loading && <p>Loading…</p>}
      {err && <p style={{ color: "crimson", marginBottom: 12 }}>{err}</p>}
      {joinMsg && <p style={{ color: "green", marginBottom: 12 }}>{joinMsg}</p>}

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Create a league</h2>
        <form onSubmit={handleCreate} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, opacity: 0.85 }}>League name</span>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Work League"
              maxLength={100}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit", minWidth: 200 }}
            />
          </label>
          <button
            type="submit"
            disabled={!createName.trim() || createSubmitting}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.1)",
              color: "inherit",
              fontWeight: 600,
              cursor: createSubmitting || !createName.trim() ? "not-allowed" : "pointer",
              opacity: createSubmitting || !createName.trim() ? 0.6 : 1,
            }}
          >
            {createSubmitting ? "Creating…" : "Create"}
          </button>
        </form>
        {createSuccess && (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
            }}
          >
            <p style={{ fontWeight: 600, marginBottom: 6 }}>League created</p>
            <p style={{ marginBottom: 6 }}>Invite code: <strong style={{ letterSpacing: 2 }}>{createSuccess.invite_code}</strong></p>
            <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>Share this code so others can join.</p>
            <Link
              href={`/leagues/${createSuccess.id}`}
              style={{ fontSize: 14, opacity: 0.9 }}
            >
              Open league →
            </Link>
          </div>
        )}
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Join a league</h2>
        <form onSubmit={handleJoin} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, opacity: 0.85 }}>Invite code (6 characters)</span>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.replace(/\s/g, "").slice(0, 6))}
              placeholder="Enter code"
              maxLength={6}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "inherit", width: 150, letterSpacing: 2 }}
            />
          </label>
          <button
            type="submit"
            disabled={joinCode.trim().length !== 6 || joinSubmitting}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.1)",
              color: "inherit",
              fontWeight: 600,
              cursor: joinCode.trim().length !== 6 || joinSubmitting ? "not-allowed" : "pointer",
              opacity: joinCode.trim().length !== 6 || joinSubmitting ? 0.6 : 1,
            }}
          >
            {joinSubmitting ? "Joining…" : "Join"}
          </button>
        </form>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Your leagues</h2>
        {!loading && !err && leagues.length === 0 && (
          <p style={{ opacity: 0.8 }}>You’re not in any leagues yet. Create one or join with a code above.</p>
        )}
        {!loading && !err && leagues.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {leagues.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/leagues/${l.id}`}
                  style={{
                    display: "block",
                    padding: "14px 18px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)",
                    textDecoration: "none",
                    color: "inherit",
                    fontWeight: 600,
                  }}
                >
                  {l.name} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
