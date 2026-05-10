"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { LeaderboardTable, type LeaderboardEntry } from "@/components/leaderboard/LeaderboardTable";
import { ChatPanel } from "@/components/chat/ChatPanel";

const PAGE_SIZE = 50;

const GLOBAL_LEAGUE_ID_CLIENT = process.env.NEXT_PUBLIC_GLOBAL_LEAGUE_ID?.trim() ?? null;

function getLeagueInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  return name.slice(0, 2).toUpperCase();
}

export default function LeagueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = typeof params.leagueId === "string" ? params.leagueId : null;
  const isAppGlobalLeague =
    GLOBAL_LEAGUE_ID_CLIENT != null && leagueId != null && leagueId === GLOBAL_LEAGUE_ID_CLIENT;

  const [leagueName, setLeagueName] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myPoints, setMyPoints] = useState<number | null>(null);
  const [gapToFirst, setGapToFirst] = useState<number | null>(null);
  const [rankChange, setRankChange] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  /** Non-fatal: summary loaded but leaderboard request failed */
  const [leaderboardErr, setLeaderboardErr] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);

  useEffect(() => {
    if (!leagueId) {
      queueMicrotask(() => {
        setErr("Missing league");
        setLoading(false);
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      setLoading(true);
      setLoadingLeaderboard(true);
      setErr(null);
      setLeaderboardErr(null);
    });

    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setCurrentUserId(data.user?.id ?? null);
    });

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.access_token) {
        router.replace("/");
        setLoading(false);
        setLoadingLeaderboard(false);
        return;
      }

      const authHeaders = { Authorization: `Bearer ${session.access_token}` };
      const lbParams = new URLSearchParams();
      lbParams.set("leagueId", leagueId);
      lbParams.set("limit", String(PAGE_SIZE));
      lbParams.set("offset", "0");

      let summaryRes: Response;
      let lbRes: Response;
      try {
        [summaryRes, lbRes] = await Promise.all([
          fetch(`/api/leagues?leagueId=${encodeURIComponent(leagueId)}`, { headers: authHeaders }),
          fetch(`/api/leaderboard?${lbParams.toString()}`),
        ]);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Network error");
          setLoading(false);
          setLoadingLeaderboard(false);
        }
        return;
      }

      const [summaryData, lbData] = await Promise.all([summaryRes.json(), lbRes.json()]);
      if (cancelled) return;

      if (!summaryRes.ok) {
        setErr(summaryData.error ?? "Failed to load league");
        setLeagueName(null);
        setLoading(false);
        setLoadingLeaderboard(false);
        return;
      }

      const summary = summaryData.leagues?.[0] as
        | {
            id: string;
            name: string;
            invite_code: string | null;
            member_count: number;
            my_rank: number | null;
            my_points: number | null;
            gap_to_first: number | null;
            rank_change: number | null;
          }
        | undefined;

      if (!summary) {
        setErr("League not found");
        setLeagueName(null);
        setLoading(false);
        setLoadingLeaderboard(false);
        return;
      }

      setLeagueName(summary.name);
      setInviteCode(summary.invite_code ?? null);
      setMemberCount(summary.member_count ?? 0);
      setMyRank(summary.my_rank ?? null);
      setMyPoints(summary.my_points ?? null);
      setGapToFirst(summary.gap_to_first ?? null);
      setRankChange(summary.rank_change ?? null);
      setLoading(false);

      if (!lbRes.ok || lbData.error) {
        setLeaderboardErr(lbData.error ?? "Failed to load leaderboard");
        setEntries([]);
        setTotalCount(0);
      } else {
        setLeaderboardErr(null);
        setEntries(lbData.entries ?? []);
        setTotalCount(lbData.total_count ?? 0);
      }
      setLoadingLeaderboard(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [leagueId, router]);

  const copyInviteCode = useCallback(() => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    });
  }, [inviteCode]);

  if (!leagueId) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <p className="text-destructive">Missing league.</p>
          <Link href="/leagues" className="text-primary hover:underline mt-2 inline-block">
            ← All leagues
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-3 py-4 sm:px-4 sm:py-6">
        <div className="mb-4">
          <Link
            href="/leagues"
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ← All leagues
          </Link>
        </div>

        {loading && <p className="text-muted-foreground">Loading…</p>}
        {err && <p className="text-destructive mb-4">{err}</p>}

        {!loading && !err && leagueName && (
          <>
            <section className="mb-6 overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-4 shadow-2xl shadow-primary/5 ring-1 ring-primary/10 backdrop-blur sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                    League Hub
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 text-2xl font-black text-primary shadow-lg shadow-primary/10">
                      {getLeagueInitials(leagueName)}
                    </div>
                    <div className="min-w-0">
                      <h1 className="truncate text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                        {leagueName}
                      </h1>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {memberCount} {memberCount === 1 ? "member" : "members"} competing this season
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 lg:min-w-[360px]">
                  <div className="rounded-xl border border-border/70 bg-background/55 px-3 py-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Rank
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xl font-black text-foreground">
                      {myRank != null ? `#${myRank}` : "—"}
                      {rankChange != null && rankChange !== 0 && (
                        <span
                          className={rankChange > 0 ? "text-sm font-semibold text-primary" : "text-sm font-semibold text-destructive"}
                          title={rankChange > 0 ? "Up from last gameweek" : "Down from last gameweek"}
                        >
                          {rankChange > 0 ? "↑" : "↓"} {Math.abs(rankChange)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/55 px-3 py-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Points
                    </p>
                    <p className="mt-1 text-xl font-black text-foreground">
                      {myPoints != null ? myPoints : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/55 px-3 py-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      To 1st
                    </p>
                    <p className="mt-1 text-xl font-black text-warning">
                      {gapToFirst != null ? gapToFirst : "—"}
                    </p>
                  </div>
                </div>
              </div>

              {inviteCode && (
                <div className="mt-5 rounded-2xl border border-border/70 bg-background/45 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Invite code
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex-1 rounded-xl border border-border/70 bg-card/70 px-3 py-2 font-mono text-sm tracking-widest text-foreground">
                      {inviteCode}
                    </div>
                    <button
                      type="button"
                      onClick={copyInviteCode}
                      className="min-h-[40px] rounded-xl border border-border bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/10"
                    >
                      {copyDone ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {leaderboardErr && (
              <p className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{leaderboardErr}</p>
            )}

            {/* Leaderboard table */}
            <div>
              <LeaderboardTable
                entries={entries}
                currentUserId={currentUserId}
                title={`${leagueName} leaderboard`}
                loading={loadingLeaderboard}
              />
            </div>
            {!loadingLeaderboard && totalCount > PAGE_SIZE && (
              <p className="mt-3 rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm text-muted-foreground">
                Showing top {PAGE_SIZE} of {totalCount}. Use the main Leaderboard page to search or filter by gameweek.
              </p>
            )}
            {!loadingLeaderboard && isAppGlobalLeague && (
              <p className="mt-8 rounded-2xl border border-border/70 bg-card/70 p-4 text-sm text-muted-foreground shadow-lg shadow-black/10 backdrop-blur">
                League chat is not shown here use{" "}
                <span className="font-medium text-foreground">Global chat</span> accessed from the bottom right of the screen.
              </p>
            )}
            {!loadingLeaderboard && !isAppGlobalLeague && (
              <div className="mt-8">
                <ChatPanel scope="league" leagueId={leagueId} title={`${leagueName} chat`} />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
