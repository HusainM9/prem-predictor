"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { validateLeagueName } from "@/lib/name-validation";

type LeagueSummaryItem = {
  id: string;
  name: string;
  invite_code: string | null;
  member_count: number;
  my_rank: number | null;
  my_points: number | null;
  gap_to_first: number | null;
  rank_change: number | null;
};

const LEAGUE_AVATAR_COLORS = [
  "bg-emerald-700 text-white",  
  "bg-teal-600 text-white",     
  "bg-amber-800 text-white",    
  "bg-violet-700 text-white",  
  "bg-sky-700 text-white",
];

function getLeagueInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  return name.slice(0, 2).toUpperCase();
}

function avatarColor(leagueId: string): string {
  let h = 0;
  for (let i = 0; i < leagueId.length; i++) h = (h << 5) - h + leagueId.charCodeAt(i);
  return LEAGUE_AVATAR_COLORS[Math.abs(h) % LEAGUE_AVATAR_COLORS.length];
}

function rankSuffix(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

export default function LeaguesPage() {
  const router = useRouter();
  const [leagues, setLeagues] = useState<LeagueSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [tab, setTab] = useState<"create" | "join">("create");
  const [createName, setCreateName] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<{ name: string; invite_code: string; id: string } | null>(null);

  const [joinCode, setJoinCode] = useState("");
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [joinMsg, setJoinMsg] = useState<string | null>(null);

  const loadLeagues = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const res = await fetch("/api/leagues", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error ?? "Failed to load leagues");
      setLeagues([]);
      return;
    }
    setErr(null);
    setLeagues(data.leagues ?? []);
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
    return () => { cancelled = true; };
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

  async function handleJoinGlobal() {
    if (joinSubmitting) return;
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
        body: JSON.stringify({ code: "GLOBAL" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Failed to join global league");
        return;
      }
      setJoinMsg(data.name ? `Joined "${data.name}".` : "Joined global league.");
      await loadLeagues();
    } finally {
      setJoinSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            ← Back
          </Link>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold text-foreground">Scoreline</span>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">Leagues</h1>
        <p className="text-muted-foreground mb-6">
          Create a private league or join with a 6-character code.
        </p>

        {err && (
          <p className="text-destructive mb-4 text-sm">{err}</p>
        )}
        {joinMsg && (
          <p className="text-primary mb-4 text-sm">{joinMsg}</p>
        )}

        {/* Create / Join card */}
        <section className="rounded-lg border border-border bg-card p-4 mb-8">
          <div className="flex gap-1 mb-4">
            <button
              type="button"
              onClick={() => setTab("create")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === "create"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span aria-hidden>+</span> Create
            </button>
            <button
              type="button"
              onClick={() => setTab("join")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === "join"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span aria-hidden>🔗</span> Join
            </button>
          </div>

          {tab === "create" && (
            <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
              <label className="flex-1 min-w-[180px]">
                <span className="block text-sm text-muted-foreground mb-1">League name</span>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Office Legends"
                  maxLength={100}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <button
                type="submit"
                disabled={!createName.trim() || createSubmitting}
                className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
              >
                + Create
              </button>
            </form>
          )}

          {tab === "join" && (
            <div className="space-y-3">
              <form onSubmit={handleJoin} className="flex flex-wrap items-end gap-3">
                <label className="flex-1 min-w-[180px]">
                  <span className="block text-sm text-muted-foreground mb-1">Invite code (6 characters)</span>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.replace(/\s/g, "").slice(0, 6).toUpperCase())}
                    placeholder="Enter code"
                    maxLength={6}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring tracking-widest font-mono"
                  />
                </label>
                <button
                  type="submit"
                  disabled={joinCode.trim().length !== 6 || joinSubmitting}
                  className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {joinSubmitting ? "Joining…" : "Join"}
                </button>
              </form>
              <button
                type="button"
                onClick={handleJoinGlobal}
                disabled={joinSubmitting}
                className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
              >
                Join Global League
              </button>
            </div>
          )}

          {createSuccess && (
            <div className="mt-4 p-3 rounded-lg border border-border bg-muted/30">
              <p className="font-semibold text-foreground mb-1">League created</p>
              <p className="text-sm text-muted-foreground mb-2">
                Invite code: <strong className="tracking-widest font-mono text-foreground">{createSuccess.invite_code}</strong>
              </p>
              <Link href={`/leagues/${createSuccess.id}`} className="text-sm text-primary hover:underline">
                Open league →
              </Link>
            </div>
          )}
        </section>

        {/* Your leagues */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Your leagues
            </h2>
            {!loading && leagues.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {leagues.length} {leagues.length === 1 ? "league" : "leagues"}
              </span>
            )}
          </div>

          {loading && <p className="text-muted-foreground">Loading…</p>}
          {!loading && !err && leagues.length === 0 && (
            <p className="text-muted-foreground">
              You&apos;re not in any leagues yet. Create one or join with a code above.
            </p>
          )}
          {!loading && leagues.length > 0 && (
            <ul className="space-y-2 list-none p-0 m-0">
              {leagues.map((league, index) => {
                const isFirst = league.my_rank === 1;
                const isSecond = league.my_rank === 2;
                const isThird = league.my_rank === 3;
                const rankCh = league.rank_change ?? null;
                return (
                  <li key={league.id}>
                    <Link
                      href={`/leagues/${league.id}`}
                      className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 no-underline text-foreground hover:bg-muted/20 transition-colors"
                    >
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(league.id)}`}
                      >
                        {getLeagueInitials(league.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{league.name}</span>
                          <span className="rounded bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary">
                            {index === 0 ? "DEFAULT" : "ACTIVE"}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {league.member_count} {league.member_count === 1 ? "member" : "members"}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {league.my_rank != null && league.my_points != null && (
                            <>
                              <span className="font-semibold text-foreground flex items-center gap-1">
                                {rankSuffix(league.my_rank)}
                                {isFirst && <span className="text-warning" aria-hidden>👑</span>}
                                {isSecond && (<span className="text-2xl" aria-hidden>🥈</span>)}
                                {isThird && (<span className="text-2xl" aria-hidden>🥉</span>)}
                                {rankCh != null && rankCh !== 0 && (
                                  <span
                                    className={rankCh > 0 ? "text-primary text-xs font-normal" : "text-destructive text-xs font-normal"}
                                    title={rankCh > 0 ? "Up from last gameweek" : "Down from last gameweek"}
                                  >
                                    {rankCh > 0 ? "↑" : "↓"} {Math.abs(rankCh)}
                                  </span>
                                )}
                              </span>
                              <span className="text-muted-foreground">{league.my_points} pts</span>
                              {isFirst ? (
                                <span className="text-primary text-sm">Leading the league</span>
                              ) : league.gap_to_first != null ? (
                                <span className="text-muted-foreground text-sm">
                                  {league.gap_to_first} pts off 1st
                                </span>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-muted-foreground shrink-0" aria-hidden>
                        →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
