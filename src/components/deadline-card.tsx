"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Clock, CheckCircle2, ChevronRight } from "lucide-react"

interface DeadlineCardProps {
  /** Next fixture kickoff time; countdown shows until this. Pass null to hide countdown. */
  nextKickoff: Date | null
  predicted?: boolean
  className?: string
}

export function DeadlineCard({
  nextKickoff,
  predicted = false,
  className,
}: DeadlineCardProps) {
  const [timeLeft, setTimeLeft] = useState("")
  const [isUrgent, setIsUrgent] = useState(false)

  useEffect(() => {
    if (!nextKickoff) {
      queueMicrotask(() => setTimeLeft("No upcoming fixtures"))
      return
    }
    const kickoff: Date = nextKickoff
    function calculate() {
      const now = new Date()
      const diff = kickoff.getTime() - now.getTime()

      if (diff <= 0) {
        setTimeLeft("Kickoff passed")
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      setIsUrgent(hours < 3)

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`)
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`)
      }
    }

    calculate()
    const interval = setInterval(calculate, 1000)
    return () => clearInterval(interval)
  }, [nextKickoff])

  if (predicted) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 max-sm:gap-2 max-sm:p-3 sm:gap-4 sm:p-5",
          className
        )}
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="size-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            Predictions submitted
          </p>
          <p className="text-xs text-muted-foreground">
            Next kickoff: {timeLeft}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="text-primary" asChild>
          <Link href="/play">
            Edit
            <ChevronRight className="size-3.5" />
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 max-sm:gap-3 max-sm:p-3 sm:gap-4 sm:p-5",
        isUrgent
          ? "border-negative/30 bg-negative/5"
          : "border-border bg-card",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            isUrgent ? "bg-negative/10" : "bg-secondary"
          )}
        >
          <Clock
            className={cn(
              "size-5",
              isUrgent ? "text-negative" : "text-muted-foreground"
            )}
          />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Next kickoff in
          </p>
          <p
            className={cn(
              "text-lg font-bold tabular-nums max-sm:text-lg sm:text-xl",
              isUrgent ? "text-negative" : "text-foreground"
            )}
          >
            {timeLeft}
          </p>
        </div>
      </div>
      <Button className="w-full font-semibold" size="lg" asChild>
        <Link href="/play">
          Make Predictions
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </div>
  )
}
