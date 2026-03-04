"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ChevronRight } from "lucide-react"
import Link from "next/link"

interface Team {
  name: string
  shortName: string
}

interface FixtureCardProps {
  homeTeam: Team
  awayTeam: Team
  kickoff: string
  predicted?: boolean
  prediction?: { home: number; away: number }
  className?: string
  onPredict?: () => void
}

export function FixtureCard({
  homeTeam,
  awayTeam,
  kickoff,
  predicted = false,
  prediction,
  className,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- optional, kept for API compatibility
  onPredict,
}: FixtureCardProps) {
  return (
    <div
      className={cn(
        "flex items-center rounded-lg border border-border bg-card p-3 transition-colors hover:bg-secondary/50 max-sm:min-w-0 max-sm:p-3 sm:p-4",
        predicted && "border-primary/30",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 max-sm:gap-1.5 sm:gap-2">
        <div className="flex items-center gap-2 max-sm:gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1 max-sm:gap-1 sm:gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold text-foreground max-sm:text-xs sm:text-sm">
                {homeTeam.name}
              </span>
              {predicted && prediction && (
                <span className="shrink-0 text-xs font-bold text-primary tabular-nums max-sm:text-xs sm:text-sm">
                  {prediction.home}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold text-foreground max-sm:text-xs sm:text-sm">
                {awayTeam.name}
              </span>
              {predicted && prediction && (
                <span className="shrink-0 text-xs font-bold text-primary tabular-nums max-sm:text-xs sm:text-sm">
                  {prediction.away}
                </span>
              )}
            </div>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground max-sm:text-[10px] sm:text-xs">{kickoff}</span>
      </div>

      <div className="ml-2 shrink-0 max-sm:ml-2 sm:ml-4">
        {predicted ? (
          <div className="flex h-7 items-center rounded-md bg-primary/10 px-2 max-sm:h-7 max-sm:px-2 sm:h-8 sm:px-3">
            <span className="text-[10px] font-medium text-primary max-sm:text-[10px] sm:text-xs">Predicted</span>
          </div>
        ) : (
          <Button size="sm" asChild className="gap-1 max-sm:h-7 max-sm:px-2 max-sm:text-xs sm:h-auto sm:px-3">
            <Link href="/play">
              Predict
              <ChevronRight className="size-3 max-sm:size-3 sm:size-3.5" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
