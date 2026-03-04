import { Button } from "@/components/ui/button"
import { LeaderboardPreview } from "@/components/leaderboard-preview"
import { FixtureCard } from "@/components/fixture-card"
import {
  Trophy,
  Target,
  TrendingUp,
  ChevronRight,
} from "lucide-react"

const mockLeaderboard = [
  { rank: 1, name: "Marcus T.", initials: "MT", points: 87, change: 0 },
  { rank: 2, name: "Sophie K.", initials: "SK", points: 82, change: 2 },
  { rank: 3, name: "Jake R.", initials: "JR", points: 79, change: -1 },
  { rank: 4, name: "Priya M.", initials: "PM", points: 74, change: 1 },
  { rank: 5, name: "Dan W.", initials: "DW", points: 71, change: -2 },
]

const mockFixtures = [
  {
    homeTeam: { name: "Arsenal", shortName: "ARS" },
    awayTeam: { name: "Chelsea", shortName: "CHE" },
    kickoff: "Sat 15:00",
  },
  {
    homeTeam: { name: "Liverpool", shortName: "LIV" },
    awayTeam: { name: "Man City", shortName: "MCI" },
    kickoff: "Sun 16:30",
  },
]

export function LandingPage({
  onLogin,
  currentGameweek = null,
}: {
  onLogin: () => void
  currentGameweek?: number | null
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* single navbar is provided by layout Navbar when logged out */}
      <section className="border-b border-border">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-4 py-10 max-sm:gap-4 max-sm:px-3 max-sm:py-8 sm:gap-6 md:gap-8 md:py-16 lg:py-24">
          <div className="flex max-w-2xl flex-col gap-4 max-sm:gap-3 sm:gap-5">
            <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 w-fit max-sm:px-2.5 max-sm:py-0.5">
              <div className="size-1.5 rounded-full bg-positive animate-pulse" />
              <span className="text-xs font-medium text-muted-foreground max-sm:text-[11px]">
                {currentGameweek != null ? `Gameweek ${currentGameweek} is live` : "Gameweek is live"}
              </span>
            </div>
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground text-balance max-sm:text-2xl sm:text-4xl md:text-6xl">
              Outscore your mates. Every week.
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground max-sm:text-sm sm:text-lg md:text-xl">
              Predict match scores, earn points, and climb the table. Create a private league and see who really knows football.
            </p>
          </div>
          <div className="flex flex-col gap-2 max-sm:gap-2 sm:flex-row sm:gap-3">
            <Button size="lg" className="w-full font-semibold text-base px-8 max-sm:w-full max-sm:py-2.5 max-sm:text-sm sm:w-auto" onClick={onLogin}>
              Create a League
              <ChevronRight className="size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full font-semibold text-base px-8 max-sm:w-full max-sm:py-2.5 max-sm:text-sm sm:w-auto"
              onClick={onLogin}
            >
              Join a League
            </Button>
          </div>
        </div>
      </section>

      {/* Live Preview */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1100px] px-4 py-10 max-sm:px-3 max-sm:py-8 sm:py-12 md:py-16">
          <div className="mb-6 flex flex-col gap-2 max-sm:mb-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary max-sm:text-[10px]">
              Live competition
            </span>
            <h2 className="text-xl font-bold text-foreground text-balance max-sm:text-lg sm:text-2xl md:text-3xl">
              See who leads the pack
            </h2>
          </div>

          <div className="grid gap-4 max-sm:gap-4 sm:gap-6 md:grid-cols-2">
            {/* Leaderboard */}
            <LeaderboardPreview
              entries={mockLeaderboard}
              title="The Sunday League"
            />

            {/* Upcoming Predictions */}
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Upcoming Fixtures
              </h3>
              <div className="flex flex-col gap-2">
                {mockFixtures.map((fixture, i) => (
                  <FixtureCard
                    key={i}
                    homeTeam={fixture.homeTeam}
                    awayTeam={fixture.awayTeam}
                    kickoff={fixture.kickoff}
                    onPredict={onLogin}
                  />
                ))}
              </div>

              {/* Points movement */}
              <div className="mt-2 rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <TrendingUp className="size-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    Recent Movement
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {[
                    { name: "Sophie K.", change: "+2 places", positive: true },
                    { name: "Dan W.", change: "-2 places", positive: false },
                    { name: "Priya M.", change: "+1 place", positive: true },
                  ].map((move, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-foreground">{move.name}</span>
                      <span
                        className={
                          move.positive
                            ? "font-medium text-positive"
                            : "font-medium text-negative"
                        }
                      >
                        {move.change}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1100px] px-4 py-10 max-sm:px-3 max-sm:py-8 sm:py-12 md:py-16">
          <div className="mb-6 flex flex-col gap-2 max-sm:mb-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary max-sm:text-[10px]">
              How it works
            </span>
            <h2 className="text-xl font-bold text-foreground max-sm:text-lg sm:text-2xl md:text-3xl">
              Three steps. Every week.
            </h2>
          </div>

          <div className="grid gap-4 max-sm:grid-cols-1 max-sm:gap-3 sm:grid-cols-3 sm:gap-6">
            {[
              {
                icon: Trophy,
                step: "01",
                title: "Create or join a league",
                description:
                  "Start a private league with your mates or join an existing one with a code.",
              },
              {
                icon: Target,
                step: "02",
                title: "Predict weekly fixtures",
                description:
                  "Submit your score predictions before the deadline each gameweek.",
              },
              {
                icon: TrendingUp,
                step: "03",
                title: "Earn points & climb",
                description:
                  "Get points for correct predictions. Track your rank and watch the table shift.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 max-sm:gap-3 max-sm:p-4 sm:gap-4 sm:p-6"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-md bg-primary/10">
                    <item.icon className="size-5 text-primary" />
                  </div>
                  <span className="text-xs font-bold tracking-wider text-muted-foreground">
                    STEP {item.step}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-[1100px] px-4 py-10 max-sm:px-3 max-sm:py-8 md:py-16">
          <div className="flex flex-col items-center gap-4 rounded-lg border border-primary/20 bg-primary/5 p-6 text-center max-sm:gap-3 max-sm:p-4 sm:gap-6 sm:p-8 md:p-12">
            <h2 className="text-xl font-bold text-foreground text-balance max-sm:text-lg sm:text-2xl md:text-3xl">
              Ready to prove you know the game?
            </h2>
            <p className="max-w-md text-sm text-muted-foreground max-sm:text-xs sm:text-base">
              Create your league, invite your friends, and start predicting this week.
            </p>
            <Button size="lg" className="w-full font-semibold text-base px-8 max-sm:w-full max-sm:text-sm sm:w-auto" onClick={onLogin}>
              Get Started Free
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-2 px-4 py-4 max-sm:gap-1 max-sm:px-3 max-sm:py-3 max-sm:text-center sm:flex-row sm:justify-between sm:py-6">
          <span className="text-xs text-muted-foreground">
            Scoreline
          </span>
          <span className="text-xs text-muted-foreground">
            Built for the love of the game.
          </span>
        </div>
      </footer>
    </div>
  )
}
