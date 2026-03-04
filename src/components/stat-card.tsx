import { cn } from "@/lib/utils"
import { ArrowUp, ArrowDown } from "lucide-react"

interface StatCardProps {
  label: string
  value: string | number
  change?: number
  className?: string
}

export function StatCard({ label, value, change, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border border-border bg-card p-3 max-sm:gap-0.5 max-sm:p-3 sm:gap-1 sm:p-4",
        className
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground max-sm:text-[10px] sm:text-xs">
        {label}
      </span>
      <div className="flex items-end gap-1 max-sm:gap-1 sm:gap-2">
        <span className="text-lg font-bold text-foreground max-sm:text-lg sm:text-2xl">{value}</span>
        {change !== undefined && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-sm font-semibold",
              change > 0 && "text-positive",
              change < 0 && "text-negative",
              change === 0 && "text-muted-foreground"
            )}
          >
            {change > 0 ? (
              <ArrowUp className="size-3.5" />
            ) : change < 0 ? (
              <ArrowDown className="size-3.5" />
            ) : null}
            {change > 0 ? `+${change}` : change}
          </span>
        )}
      </div>
    </div>
  )
}
