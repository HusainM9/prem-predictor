"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { DeadlineCard } from "@/components/deadline-card"
import { StatCard } from "@/components/stat-card"
import { FixtureCard } from "@/components/fixture-card"
import { LeaderboardPreview } from "@/components/leaderboard-preview"
import { VoteForMatchOfTheWeek } from "@/components/VoteForMatchOfTheWeek"
import { Skeleton } from "@/components/ui/skeleton"
import { ChevronRight, Inbox, ChevronLeft } from "lucide-react"

const MAX_LEAGUE_TABS = 5

type LeagueRow = { id: string; name: string }

type LeaderboardEntryPreview = {
  rank: number
  name: string
  initials: string
  points: number
  change: number
  isCurrentUser?: boolean
}

type UpcomingFixture = {
  homeTeam: { name: string; shortName: string }
  awayTeam: { name: string; shortName: string }
  kickoff: string
  predicted?: boolean
  prediction?: { home: number; away: number }
}

function getInitials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-28 w-full rounded-lg" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  )
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-card p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-secondary">
        <Inbox className="size-6 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action && (
        <Button size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

export function DashboardPage({ onLogout }: { onLogout: () => void }) {
  const router = useRouter()
  const [nextKickoff, setNextKickoff] = useState<Date | null>(null)
  const [currentGameweek, setCurrentGameweek] = useState<number | null>(null)
  const [leagues, setLeagues] = useState<LeagueRow[]>([])
  const [leagueTabIndex, setLeagueTabIndex] = useState(0)
  const [leagueLeaderboards, setLeagueLeaderboards] = useState<
    Record<string, LeaderboardEntryPreview[]>
  >({})
  const [rank, setRank] = useState<number | null>(null)
  const [points, setPoints] = useState<number | null>(null)
  const [lastGwChange, setLastGwChange] = useState<number | null>(null)
  const [upcomingFixtures, setUpcomingFixtures] = useState<UpcomingFixture[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  const hasLeague = leagues.length > 0
  const displayLeagues = leagues.slice(0, MAX_LEAGUE_TABS)
  const currentLeague = displayLeagues[leagueTabIndex] ?? null
  const currentLeaderboard = currentLeague
    ? leagueLeaderboards[currentLeague.id] ?? []
    : []

  const loadNextKickoffAndGameweek = useCallback(async () => {
    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from("fixtures")
      .select("kickoff_time, gameweek")
      .eq("season", "2025/26")
      .eq("status", "scheduled")
      .gte("kickoff_time", nowIso)
      .order("kickoff_time", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!error && data) {
      setNextKickoff(new Date((data as { kickoff_time: string }).kickoff_time))
      setCurrentGameweek((data as { gameweek: number }).gameweek ?? null)
    } else {
      setNextKickoff(null)
      setCurrentGameweek(null)
    }
  }, [])

  const loadLeagues = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    setUserId(user.id)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return []
    const res = await fetch("/api/leagues", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!res.ok) {
      setLeagues([])
      return []
    }
    const data = await res.json()
    const rows: LeagueRow[] = (data.leagues ?? []).map((l: { id: string; name: string }) => ({
      id: l.id,
      name: l.name,
    }))
    setLeagues(rows)
    return rows
  }, [])

  const loadLeaderboard = useCallback(
    async (leagueId: string | null): Promise<{ entries: LeaderboardEntryPreview[]; rank: number | null; points: number | null }> => {
      const url = leagueId
        ? `/api/leaderboard?leagueId=${encodeURIComponent(leagueId)}&limit=10`
        : "/api/leaderboard?limit=10"
      const res = await fetch(url)
      if (!res.ok) return { entries: [], rank: null, points: null }
      const data = await res.json()
      const entries: LeaderboardEntryPreview[] = (data.entries ?? []).map(
        (e: { rank: number; user_id: string; display_name: string; total_points: number }) => ({
          rank: e.rank,
          name: e.display_name ?? "Player",
          initials: getInitials(e.display_name ?? "P"),
          points: e.total_points,
          change: 0,
          isCurrentUser: e.user_id === userId,
        })
      )
      const me = entries.find((e) => e.isCurrentUser)
      return {
        entries,
        rank: me?.rank ?? null,
        points: me?.points ?? null,
      }
    },
    [userId]
  )

  const loadLastGwChange = useCallback(
    async (leagueId: string | null) => {
      if (currentGameweek == null || currentGameweek < 2 || !userId) return null
      const gw = currentGameweek
      const [curRes, prevRes] = await Promise.all([
        fetch(
          leagueId
            ? `/api/leaderboard?leagueId=${encodeURIComponent(leagueId)}&gameweek=${gw}`
            : `/api/leaderboard?gameweek=${gw}`
        ),
        fetch(
          leagueId
            ? `/api/leaderboard?leagueId=${encodeURIComponent(leagueId)}&gameweek=${gw - 1}`
            : `/api/leaderboard?gameweek=${gw - 1}`
        ),
      ])
      const curData = curRes.ok ? await curRes.json() : { entries: [] }
      const prevData = prevRes.ok ? await prevRes.json() : { entries: [] }
      const curEntry = (curData.entries ?? []).find((e: { user_id: string }) => e.user_id === userId)
      const prevEntry = (prevData.entries ?? []).find((e: { user_id: string }) => e.user_id === userId)
      if (prevEntry == null || curEntry == null) return null
      return (prevEntry.rank as number) - (curEntry.rank as number)
    },
    [currentGameweek, userId]
  )

  const loadUpcomingFixtures = useCallback(async () => {
    const nowIso = new Date().toISOString()
    const { data: fx } = await supabase
      .from("fixtures")
      .select("id, kickoff_time, home_team, away_team, gameweek")
      .eq("season", "2025/26")
      .eq("status", "scheduled")
      .gte("kickoff_time", nowIso)
      .order("kickoff_time", { ascending: true })
      .limit(3)
    if (!fx?.length) {
      setUpcomingFixtures([])
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    const predictedIds = new Set<string>()
    const predictionByFixture: Record<string, { home: number; away: number }> = {}
    if (session?.access_token) {
      const fixtureIds = fx.map((f: { id: string }) => f.id).join(",")
      const predRes = await fetch(
        `/api/predictions/for-fixtures?fixtureIds=${encodeURIComponent(fixtureIds)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (predRes.ok) {
        const predData = await predRes.json()
        const list = predData.predictions ?? []
        for (const p of list) {
          predictedIds.add(p.fixture_id)
          if (p.pred_home_goals != null && p.pred_away_goals != null) {
            predictionByFixture[p.fixture_id] = { home: p.pred_home_goals, away: p.pred_away_goals }
          }
        }
      }
    }
    const formatKickoff = (iso: string) => {
      const d = new Date(iso)
      return d.toLocaleDateString("en-GB", {
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    }
    const list: UpcomingFixture[] = fx.map((f: { id: string; kickoff_time: string; home_team: string; away_team: string }) => {
      const short = (s: string) => s.slice(0, 3).toUpperCase()
      const pred = predictionByFixture[f.id]
      return {
        homeTeam: { name: f.home_team, shortName: short(f.home_team) },
        awayTeam: { name: f.away_team, shortName: short(f.away_team) },
        kickoff: formatKickoff(f.kickoff_time),
        predicted: predictedIds.has(f.id),
        prediction: pred,
      }
    })
    setUpcomingFixtures(list)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setIsLoading(true)
      await loadNextKickoffAndGameweek()
      const userLeagues = await loadLeagues()
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)
      if (cancelled) return
      if (userLeagues.length > 0) {
        const first = userLeagues[0]
        const { rank: r, points: p, entries } = await loadLeaderboard(first.id)
        if (!cancelled) {
          setRank(r)
          setPoints(p)
          setLeagueLeaderboards((prev) => ({ ...prev, [first.id]: entries }))
        }
        const change = await loadLastGwChange(first.id)
        if (!cancelled) setLastGwChange(change)
        for (const league of userLeagues.slice(1, MAX_LEAGUE_TABS)) {
          const { entries: e } = await loadLeaderboard(league.id)
          if (!cancelled) setLeagueLeaderboards((prev) => ({ ...prev, [league.id]: e }))
        }
      }
      await loadUpcomingFixtures()
      if (!cancelled) setIsLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [loadNextKickoffAndGameweek, loadLeagues, loadLeaderboard, loadLastGwChange, loadUpcomingFixtures])

  useEffect(() => {
    if (!currentLeague || leagueLeaderboards[currentLeague.id]?.length) return
    loadLeaderboard(currentLeague.id).then(({ entries }) => {
      setLeagueLeaderboards((prev) => ({ ...prev, [currentLeague.id]: entries }))
    })
  }, [currentLeague?.id, leagueLeaderboards, loadLeaderboard])

  const rankSuffix = (n: number) => {
    if (n >= 11 && n <= 13) return "th"
    const d = n % 10
    if (d === 1) return "st"
    if (d === 2) return "nd"
    if (d === 3) return "rd"
    return "th"
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-[1100px] px-4 py-6 max-sm:px-3 max-sm:py-4">
        {isLoading ? (
          <DashboardSkeleton />
        ) : !hasLeague ? (
          <EmptyState
            title="No league yet"
            description="Create or join a league to start competing with your friends."
            action={{ label: "Create a League", onClick: () => router.push("/signup") }}
          />
        ) : (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-xl font-bold text-foreground max-sm:text-lg md:text-2xl">
                Welcome
              </h1>
              <p className="text-sm text-muted-foreground max-sm:text-xs">
                {currentGameweek != null
                  ? `Here's your Gameweek ${currentGameweek} overview.`
                  : "Here's your overview."}
              </p>
            </div>

            <DeadlineCard nextKickoff={nextKickoff} />

            <VoteForMatchOfTheWeek gameweek={currentGameweek} variant="compact" />

            <div className="grid grid-cols-3 gap-2 max-sm:gap-2 sm:gap-3">
              <StatCard
                label="Rank"
                value={rank != null ? `${rank}${rankSuffix(rank)}` : "—"}
              />
              <StatCard
                label="Points"
                value={points ?? "—"}
              />
              <StatCard
                label="Last GW"
                value={lastGwChange != null ? (lastGwChange > 0 ? `+${lastGwChange}` : lastGwChange) : "—"}
                change={lastGwChange != null ? lastGwChange : undefined}
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Upcoming Fixtures
                </h2>
                <Button variant="link" size="sm" className="text-primary gap-1 h-auto p-0" asChild>
                  <Link href="/play" className="flex items-center gap-1">
                    View All
                    <ChevronRight className="size-3" />
                  </Link>
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {upcomingFixtures.slice(0, 3).map((fixture, i) => (
                  <FixtureCard
                    key={i}
                    homeTeam={fixture.homeTeam}
                    awayTeam={fixture.awayTeam}
                    kickoff={fixture.kickoff}
                    predicted={fixture.predicted}
                    prediction={fixture.prediction}
                  />
                ))}
                {upcomingFixtures.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">No upcoming fixtures.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card overflow-hidden max-sm:rounded-md">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 max-sm:px-3 max-sm:py-2 sm:px-4 sm:py-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {displayLeagues.length > 1 ? (
                    <>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0 max-sm:h-7 max-sm:w-7"
                        onClick={() => setLeagueTabIndex((i) => (i <= 0 ? displayLeagues.length - 1 : i - 1))}
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="min-w-0 truncate text-center text-sm font-semibold text-foreground max-sm:max-w-[80px] max-sm:text-xs sm:min-w-[100px]">
                        {currentLeague?.name ?? "League"}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0 max-sm:h-7 max-sm:w-7"
                        onClick={() => setLeagueTabIndex((i) => (i >= displayLeagues.length - 1 ? 0 : i + 1))}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm font-semibold text-foreground">
                      {currentLeague?.name ?? "League"}
                    </span>
                  )}
                  {displayLeagues.length > 1 && (
                    <div className="flex gap-1.5 ml-1">
                      {displayLeagues.map((league, i) => (
                        <button
                          key={league.id}
                          type="button"
                          aria-label={`League: ${league.name}`}
                          onClick={() => setLeagueTabIndex(i)}
                          className={`size-2 rounded-full transition-colors ${
                            i === leagueTabIndex ? "bg-primary" : "bg-muted-foreground/30"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <Button variant="link" size="sm" className="text-primary gap-1 h-auto p-0" asChild>
                  <Link href="/leaderboard" className="flex items-center gap-1">
                    Full Table
                    <ChevronRight className="size-3" />
                  </Link>
                </Button>
              </div>
              <LeaderboardPreview
                entries={currentLeaderboard}
                embedded
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
