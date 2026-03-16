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

  useEffect(() => {
    let cancelled = false
    async function run() {
      setIsLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        if (!cancelled) setIsLoading(false)
        return
      }
      const res = await fetch("/api/dashboard", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (cancelled) return
      if (!res.ok) {
        setLeagues([])
        setLeagueLeaderboards({})
        setRank(null)
        setPoints(null)
        setLastGwChange(null)
        setUpcomingFixtures([])
        setCurrentGameweek(null)
        setNextKickoff(null)
        setUserId(null)
        setIsLoading(false)
        return
      }
      setUserId(data.user_id ?? null)
      setNextKickoff(data.next_kickoff ? new Date(data.next_kickoff) : null)
      setCurrentGameweek(data.current_gameweek ?? null)
      setLeagues(Array.isArray(data.leagues) ? data.leagues : [])
      setLeagueLeaderboards(data.league_leaderboards ?? {})
      setRank(data.rank ?? null)
      setPoints(data.points ?? null)
      setLastGwChange(data.last_gw_change ?? null)
      setUpcomingFixtures(Array.isArray(data.upcoming_fixtures) ? data.upcoming_fixtures : [])
      if (!cancelled) setIsLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [])

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
