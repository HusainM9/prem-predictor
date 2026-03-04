"use client";

import { cn } from "@/lib/utils";
import { TeamLogo } from "@/components/play/TeamLogo";
import { getShortName, getAbbreviation } from "@/lib/team-names";

type TeamDisplayProps = {
  teamName: string;
  /** Optional crest URL (e.g. from standings API). If not provided, TeamLogo fetches by name. */
  crestUrl?: string | null;
  /** Size of the badge in pixels */
  size?: number;
  /** Alignment of content (for Home column use end, Away use start) */
  align?: "start" | "end" | "center";
  /** "stacked" = badge on top, short name below. "abbr" = badge + abbr on small screens, badge + short name on md+ (e.g. iPad Pro). */
  layout?: "inline" | "stacked" | "abbr";
  className?: string;
};

/**
 * Responsive team display:
 * - inline (default): three levels as viewport shrinks — md+ badge + short name, sm badge + abbr, max-sm badge only
 * - stacked: badge on top, shortened name below
 * - abbr: badge + 3-letter abbreviation below md; badge + shortened name from md up (tablet/desktop)
 */
export function TeamDisplay({
  teamName,
  crestUrl,
  size = 24,
  align = "start",
  layout = "inline",
  className,
}: TeamDisplayProps) {
  const shortName = getShortName(teamName);
  const abbr = getAbbreviation(teamName);

  const alignClass =
    align === "end"
      ? "justify-end text-right"
      : align === "center"
        ? "justify-center text-center"
        : "justify-start text-left";

  const badge =
    crestUrl ? (
      // eslint-disable-next-line @next/next/no-img-element -- external crest URL
      <img
        src={crestUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 object-contain"
        style={{ width: size, height: size }}
      />
    ) : (
      <TeamLogo teamName={teamName} size={size} />
    );

  if (layout === "stacked") {
    return (
      <div
        className={cn(
          "flex min-w-0 flex-col items-center gap-0.5",
          align === "end" && "items-end",
          align === "start" && "items-start",
          align === "center" && "items-center",
          className
        )}
        style={{ minWidth: size }}
      >
        {badge}
        <span
          className="truncate text-xs font-medium text-foreground max-w-[72px] sm:max-w-[88px]"
          title={teamName}
        >
          {shortName}
        </span>
      </div>
    );
  }

  if (layout === "abbr") {
    return (
      <div
        className={cn(
          "flex min-w-0 items-center gap-1.5",
          alignClass,
          className
        )}
        style={{ minWidth: size }}
      >
        {badge}
        <span
          className="shrink-0 text-xs font-semibold tabular-nums text-foreground md:hidden sm:text-sm"
          title={teamName}
        >
          {abbr}
        </span>
        <span
          className="min-w-0 truncate text-sm font-medium text-foreground hidden md:block"
          title={teamName}
        >
          {shortName}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5",
        alignClass,
        className
      )}
      style={{ minWidth: size }}
    >
      {badge}
      <span
        className="min-w-0 truncate font-medium text-foreground hidden sm:block md:hidden"
        title={teamName}
      >
        {abbr}
      </span>
      <span
        className="min-w-0 truncate font-medium text-foreground hidden md:block"
        title={teamName}
      >
        {shortName}
      </span>
    </div>
  );
}
