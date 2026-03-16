import Link from "next/link";
import { getStandings, type StandingsData } from "@/lib/standings";

export const revalidate = 3600;

type TableRow = {
  position: number;
  team: { id: number; name: string; shortName: string; crest?: string };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  form?: string;
};

export default async function TablePage() {
  const result = await getStandings();

  if (result.error) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <p className="text-destructive font-medium">Error: {result.error}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            If this is a rate limit, wait a minute and refresh. The table is updated hourly; admins can force a refresh from the admin page.
          </p>
        </div>
      </main>
    );
  }

  const data = result.data as StandingsData;
  const stale = "stale" in result ? !!result.stale : false;
  const totalStanding = data?.standings?.find((s) => s.type === "TOTAL");
  const rows: TableRow[] = totalStanding?.table ?? [];
  const compName = data?.competition?.name ?? "Premier League";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-3 py-4 max-sm:px-3 max-sm:py-4 sm:px-4 sm:py-6">
        <div className="mb-4 flex items-center gap-2 max-sm:mb-4 max-sm:gap-2 sm:mb-6 sm:gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors max-sm:text-sm">
            ← Back
          </Link>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold text-foreground max-sm:text-sm">Scoreline</span>
        </div>

        <h1 className="mb-1.5 text-xl font-bold text-foreground max-sm:mb-1.5 max-sm:text-lg sm:mb-2 sm:text-2xl">{compName}</h1>
        <p className="mb-4 text-xs text-muted-foreground max-sm:mb-4 max-sm:text-xs sm:mb-6 sm:text-sm">
          League table · updated hourly
        </p>
        {stale && (
          <p className="mb-4 text-xs text-muted-foreground max-sm:mb-4 max-sm:text-xs sm:mb-6 sm:text-sm">
            Showing last cached table because the live provider is temporarily rate-limited.
          </p>
        )}

        <div className="rounded-lg border border-border bg-card overflow-hidden max-sm:rounded-md">
          <div className="overflow-x-auto -mx-px">
            <table className="w-full min-w-0 text-xs max-sm:text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="w-7 py-2 pl-2 pr-0 text-left font-semibold text-foreground max-sm:w-6 max-sm:py-2 max-sm:pl-2 sm:w-10 sm:py-3 sm:px-4">#</th>
                  <th className="min-w-0 py-2 px-1 text-left font-semibold text-foreground max-sm:py-2 max-sm:px-1 sm:py-3 sm:px-4">Team</th>
                  <th className="w-6 py-2 px-0.5 text-center font-semibold text-foreground max-sm:w-5 max-sm:py-2 max-sm:px-0.5 sm:w-10 sm:py-3 sm:px-2">P</th>
                  <th className="w-6 py-2 px-0.5 text-center font-semibold text-foreground max-sm:w-5 max-sm:py-2 max-sm:px-0.5 sm:w-10 sm:py-3 sm:px-2">W</th>
                  <th className="w-6 py-2 px-0.5 text-center font-semibold text-foreground max-sm:w-5 max-sm:py-2 max-sm:px-0.5 sm:w-10 sm:py-3 sm:px-2">D</th>
                  <th className="w-6 py-2 px-0.5 text-center font-semibold text-foreground max-sm:w-5 max-sm:py-2 max-sm:px-0.5 sm:w-10 sm:py-3 sm:px-2">L</th>
                  <th className="w-6 py-2 px-0.5 text-center font-semibold text-foreground max-sm:w-5 max-sm:py-2 max-sm:px-0.5 sm:w-10 sm:py-3 sm:px-2">GF</th>
                  <th className="hidden w-6 py-2 px-0.5 text-center font-semibold text-foreground max-sm:py-2 max-sm:px-0.5 sm:table-cell sm:w-10 sm:py-3 sm:px-2">GA</th>
                  <th className="hidden w-7 py-2 px-0.5 text-center font-semibold text-foreground max-sm:py-2 max-sm:px-0.5 sm:table-cell sm:w-10 sm:py-3 sm:px-2">GD</th>
                  <th className="w-8 py-2 pr-2 pl-0.5 text-center font-semibold text-foreground max-sm:w-7 max-sm:py-2 max-sm:pr-2 max-sm:pl-0.5 sm:w-12 sm:py-3 sm:px-4">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.team.id}
                    className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="py-2 pl-2 pr-0 text-muted-foreground max-sm:py-2 max-sm:pl-2 max-sm:pr-0 max-sm:text-[11px] sm:py-3 sm:px-4 sm:text-sm">{row.position}</td>
                    <td className="min-w-0 py-2 px-1 max-sm:py-2 max-sm:px-1 sm:py-3 sm:px-4">
                      <div className="flex items-center gap-1.5 max-sm:gap-1.5 sm:gap-2">
                        {row.team.crest && (
                          <img
                            src={row.team.crest}
                            alt=""
                            width={24}
                            height={24}
                            className="h-5 w-5 shrink-0 object-contain max-sm:h-5 max-sm:w-5 sm:h-6 sm:w-6"
                          />
                        )}
                        <span className="min-w-0 truncate text-xs font-medium text-foreground max-sm:text-xs sm:text-sm">
                          {row.team.shortName || row.team.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-0.5 text-center text-muted-foreground max-sm:py-2 max-sm:px-0.5 max-sm:text-[11px] sm:py-3 sm:px-2 sm:text-sm">{row.playedGames}</td>
                    <td className="py-2 px-0.5 text-center text-muted-foreground max-sm:py-2 max-sm:px-0.5 max-sm:text-[11px] sm:py-3 sm:px-2 sm:text-sm">{row.won}</td>
                    <td className="py-2 px-0.5 text-center text-muted-foreground max-sm:py-2 max-sm:px-0.5 max-sm:text-[11px] sm:py-3 sm:px-2 sm:text-sm">{row.draw}</td>
                    <td className="py-2 px-0.5 text-center text-muted-foreground max-sm:py-2 max-sm:px-0.5 max-sm:text-[11px] sm:py-3 sm:px-2 sm:text-sm">{row.lost}</td>
                    <td className="py-2 px-0.5 text-center text-muted-foreground max-sm:py-2 max-sm:px-0.5 max-sm:text-[11px] sm:py-3 sm:px-2 sm:text-sm">{row.goalsFor}</td>
                    <td className="hidden py-2 px-0.5 text-center text-muted-foreground max-sm:py-2 max-sm:px-0.5 sm:table-cell sm:py-3 sm:px-2 sm:text-sm">{row.goalsAgainst}</td>
                    <td
                      className={`hidden py-2 px-0.5 text-center font-semibold max-sm:py-2 max-sm:px-0.5 sm:table-cell sm:py-3 sm:px-2 sm:text-sm ${
                        row.goalDifference > 0
                          ? "text-primary"
                          : row.goalDifference < 0
                            ? "text-destructive"
                            : "text-foreground"
                      }`}
                    >
                      {row.goalDifference > 0 ? "+" : ""}
                      {row.goalDifference}
                    </td>
                    <td className="py-2 pr-2 pl-0.5 text-center font-bold text-foreground max-sm:py-2 max-sm:pr-2 max-sm:pl-0.5 max-sm:text-xs sm:py-3 sm:px-4 sm:text-sm">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-3 text-[10px] text-muted-foreground max-sm:mt-3 max-sm:text-[10px] sm:mt-4 sm:text-xs">
          P = Played, W = Won, D = Draw, L = Lost, GF = Goals for, GA = Goals against, GD = Goal difference, Pts = Points.
        </p>
      </div>
    </main>
  );
}
