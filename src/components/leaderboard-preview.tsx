import { cn } from "@/lib/utils"
import { ArrowUp, ArrowDown, Minus } from "lucide-react"

interface LeaderboardEntry {
  rank: number
  name: string
  initials: string
  points: number
  change: number
  isCurrentUser?: boolean
}

interface LeaderboardPreviewProps {
  entries: LeaderboardEntry[]
  title?: string
  className?: string
  /** When true render only table for embedding in a parent card. */
  embedded?: boolean
}

export function LeaderboardPreview({
  entries,
  title = "League Table",
  className,
  embedded = false,
}: LeaderboardPreviewProps) {
  const tableContent = (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 max-sm:gap-2 max-sm:px-3 max-sm:py-2 sm:gap-3 sm:px-4 sm:py-2.5">
          <span className="w-5 text-[10px] font-medium text-muted-foreground max-sm:w-5 max-sm:text-[10px] sm:w-6 sm:text-xs">#</span>
          <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-muted-foreground max-sm:text-[10px] sm:text-xs">
            Player
          </span>
          <span className="w-8 shrink-0 text-right text-[10px] font-medium text-muted-foreground max-sm:w-8 max-sm:text-[10px] sm:w-10 sm:text-xs">
            Pts
          </span>
          <span className="w-6 shrink-0 text-right text-[10px] font-medium text-muted-foreground max-sm:w-6 max-sm:text-[10px] sm:w-8 sm:text-xs">
            +/-
          </span>
        </div>

        {entries.map((entry) => (
          <div
            key={entry.rank}
            className={cn(
              "flex items-center gap-2 px-3 py-2 transition-colors max-sm:gap-2 max-sm:px-3 max-sm:py-2 sm:gap-3 sm:px-4 sm:py-3",
              entry.isCurrentUser && "bg-primary/5 border-l-2 border-l-primary",
              !entry.isCurrentUser && "border-l-2 border-l-transparent"
            )}
          >
            <span
              className={cn(
                "w-5 text-xs font-bold tabular-nums max-sm:w-5 max-sm:text-xs sm:w-6 sm:text-sm",
                entry.rank === 1 && "text-warning",
                entry.rank === 2 && "text-muted-foreground",
                entry.rank === 3 && "text-muted-foreground",
                entry.rank > 3 && "text-muted-foreground"
              )}
            >
              {entry.rank}
            </span>
            <div className="flex min-w-0 flex-1 items-center max-sm:gap-1.5 sm:gap-2.5">
              <span
                className={cn(
                  "truncate text-xs font-medium max-sm:text-xs sm:text-sm",
                  entry.isCurrentUser
                    ? "font-semibold text-foreground"
                    : "text-foreground"
                )}
              >
                {entry.name}
                {entry.isCurrentUser && (
                  <span className="ml-1 text-[10px] text-primary max-sm:ml-1 max-sm:text-[10px] sm:ml-1.5 sm:text-xs">(You)</span>
                )}
              </span>
            </div>
            <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-foreground max-sm:w-8 max-sm:text-xs sm:w-10 sm:text-sm">
              {entry.points}
            </span>
            <span
              className={cn(
                "flex w-6 shrink-0 items-center justify-end gap-0.5 text-[10px] font-semibold max-sm:w-6 max-sm:text-[10px] sm:w-8 sm:text-xs",
                entry.change > 0 && "text-positive",
                entry.change < 0 && "text-negative",
                entry.change === 0 && "text-muted-foreground"
              )}
            >
              {entry.change > 0 ? (
                <ArrowUp className="size-3" />
              ) : entry.change < 0 ? (
                <ArrowDown className="size-3" />
              ) : (
                <Minus className="size-3" />
              )}
              {Math.abs(entry.change)}
            </span>
          </div>
        ))}
    </>
  )

  if (embedded) {
    return <div className={cn("flex flex-col", className)}>{tableContent}</div>
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
        </div>
      )}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {tableContent}
      </div>
    </div>
  )
}
