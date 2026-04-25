"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { LeaderboardTable, type LeaderboardEntry } from "@/components/leaderboard/LeaderboardTable";
import { ChatPanel } from "@/components/chat/ChatPanel";

const PAGE_SIZE = 50;

function getLeagueInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  return name.slice(0, 2).toUpperCase();
}

export default function LeagueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = typeof params.leagueId === "string" ? params.leagueId : null;

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
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <Link
            href="/leagues"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ← All leagues
          </Link>
        </div>

        {loading && <p className="text-muted-foreground">Loading…</p>}
        {err && <p className="text-destructive mb-4">{err}</p>}

        {!loading && !err && leagueName && (
          <>
            {/* League info card */}
            <section className="rounded-lg border border-border bg-card p-5 mb-8">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xl font-bold">
                  {getLeagueInitials(leagueName)}
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">{leagueName}</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {memberCount} {memberCount === 1 ? "member" : "members"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Your rank
                  </p>
                  <p className="text-lg font-bold text-foreground flex items-center gap-1.5">
                    {myRank != null ? `#${myRank}` : "—"}
                    {rankChange != null && rankChange !== 0 && (
                      <span
                        className={rankChange > 0 ? "text-primary text-sm font-normal" : "text-destructive text-sm font-normal"}
                        title={rankChange > 0 ? "Up from last gameweek" : "Down from last gameweek"}
                      >
                        {rankChange > 0 ? "↑" : "↓"} {Math.abs(rankChange)}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Points
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {myPoints != null ? myPoints : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Gap to 1st
                  </p>
                  <p className="text-lg font-bold text-warning">
                    {gapToFirst != null ? gapToFirst : "—"}
                  </p>
                </div>
              </div>

              {inviteCode && (
                <div className="mb-6">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                    Invite code
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 font-mono text-foreground tracking-widest">
                      {inviteCode}
                    </div>
                    <button
                      type="button"
                      onClick={copyInviteCode}
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      <span aria-hidden>📋</span>
                      {copyDone ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {leaderboardErr && (
              <p className="text-destructive text-sm mb-3">{leaderboardErr}</p>
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
              <p className="text-sm text-muted-foreground mt-2">
                Showing top {PAGE_SIZE} of {totalCount}. Use the main Leaderboard page to search or filter by gameweek.
              </p>
            )}
            {!loadingLeaderboard && (
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
