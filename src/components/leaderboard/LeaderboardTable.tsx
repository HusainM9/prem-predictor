"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  display_name: string;
  total_points: number;
  accuracy?: number;
  correct_scores?: number;
};

type Props = {
  entries: LeaderboardEntry[];
  currentUserId?: string | null;
  title?: string;
  loading?: boolean;
};

function rankLabel(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

export function LeaderboardTable({ entries, currentUserId, title = "Leaderboard", loading }: Props) {
  if (loading) {
    return (
      <section className="mt-4 max-sm:mt-4 sm:mt-6">
        <h2 className="mb-2 text-base font-semibold text-foreground max-sm:mb-2 max-sm:text-base sm:mb-3 sm:text-lg">{title}</h2>
        <p className="text-muted-foreground max-sm:text-xs sm:text-sm">Loading…</p>
      </section>
    );
  }

  return (
    <section className="mt-4 max-sm:mt-4 sm:mt-6">
      <h2 className="mb-3 text-base font-semibold text-foreground max-sm:mb-3 max-sm:text-base sm:mb-4 sm:text-lg">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-muted-foreground max-sm:text-xs sm:text-sm">No scores yet. Make predictions and wait for results to be settled.</p>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden max-sm:rounded-md">
          <div className="overflow-x-auto -mx-px max-sm:-mx-px">
            <table className="w-full text-xs min-w-[320px] max-sm:text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="w-10 py-2 px-2 text-left font-semibold text-foreground max-sm:w-10 max-sm:py-2 max-sm:px-2 sm:w-16 sm:py-3 sm:px-4">#</th>
                  <th className="text-left py-2 px-2 font-semibold text-foreground max-sm:py-2 max-sm:px-2 sm:py-3 sm:px-4">User</th>
                  <th className="w-14 text-right py-2 px-2 font-semibold text-foreground max-sm:py-2 max-sm:px-2 sm:w-auto sm:py-3 sm:px-4">Points</th>
                  <th className="hidden text-right py-2 px-2 font-semibold text-muted-foreground max-sm:py-2 max-sm:px-2 sm:table-cell sm:py-3 sm:px-4" title="Correct results (tie-breaker)">
                    Correct
                  </th>
                  <th className="hidden text-right py-2 px-2 font-semibold text-muted-foreground max-sm:py-2 max-sm:px-2 sm:table-cell sm:py-3 sm:px-4" title="Exact scores (tie-breaker)">
                    Exact
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const isYou = currentUserId != null && e.user_id === currentUserId;
                  const isFirst = e.rank === 1;
                  return (
                    <tr
                      key={e.user_id}
                      className={cn(
                        "border-b border-border last:border-b-0 transition-colors",
                        isYou && "bg-primary/10",
                        !isYou && "hover:bg-muted/30"
                      )}
                    >
                      <td className="py-2 px-2 max-sm:py-2 max-sm:px-2 sm:py-3 sm:px-4">
                        <span
                          className={cn(
                            "font-semibold",
                            isFirst && "text-warning"
                          )}
                        >
                          {rankLabel(e.rank)}
                        </span>
                      </td>
                      <td className="min-w-0 py-2 px-2 max-sm:py-2 max-sm:px-2 sm:py-3 sm:px-4">
                        <Link
                          href={`/player/${e.user_id}`}
                          className="flex items-center no-underline text-foreground hover:text-primary transition-colors"
                        >
                          <span className={cn("truncate font-medium", isYou && "font-semibold")}>
                            {isYou ? "You" : (e.display_name ?? `User ${e.user_id.slice(0, 8)}…`)}
                          </span>
                        </Link>
                      </td>
                      <td className="py-2 px-2 text-right font-semibold text-foreground max-sm:py-2 max-sm:px-2 sm:py-3 sm:px-4">
                        {e.total_points} <span className="text-muted-foreground font-normal text-[10px] max-sm:text-[10px] sm:text-xs">pts</span>
                      </td>
                      <td className="hidden py-2 px-2 text-right text-muted-foreground max-sm:py-2 max-sm:px-2 sm:table-cell sm:py-3 sm:px-4">{e.accuracy ?? 0}</td>
                      <td className="hidden py-2 px-2 text-right text-muted-foreground max-sm:py-2 max-sm:px-2 sm:table-cell sm:py-3 sm:px-4">{e.correct_scores ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
