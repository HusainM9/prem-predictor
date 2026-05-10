"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type StatsPayload = {
  has_result: boolean;
  total_predictions: number;
  pct_correct_result: number | null;
  pct_exact_score: number | null;
};

export function FixtureCommunityStats({
  fixtureId,
  enabled,
}: {
  fixtureId: string;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next || !enabled) return;
    setLoading(true);
    setErr(null);
    fetch(`/api/predictions/fixture-community-stats?fixtureId=${encodeURIComponent(fixtureId)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed to load stats");
        return j as StatsPayload;
      })
      .then((d) => {
        if (alive.current) setData(d);
      })
      .catch((e: unknown) => {
        if (alive.current) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
  }

  if (!enabled) return null;

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger
        type="button"
        className={cn(
          "mt-2 flex w-full items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted/60",
        )}
      >
        <span>Community results</span>
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-muted-foreground">
          {loading && <p>Loading…</p>}
          {err && <p className="text-destructive">{err}</p>}
          {!loading && !err && data && (
            <>
              {!data.has_result && <p>Final result not available yet.</p>}
              {data.has_result && data.total_predictions === 0 && (
                <p>No predictions recorded for this match.</p>
              )}
              {data.has_result && data.total_predictions > 0 && (
                <ul className="space-y-1.5">
                  <li>
                    <span className="text-foreground font-medium">{data.pct_correct_result ?? 0}%</span> of players
                    had the <span className="text-foreground">correct result</span> (1X2)
                  </li>
                  <li>
                    <span className="text-foreground font-medium">{data.pct_exact_score ?? 0}%</span> had the{" "}
                    <span className="text-foreground">exact score</span>
                  </li>
                  <li className="text-xs text-muted-foreground/90">Based on {data.total_predictions} predictions.</li>
                </ul>
              )}
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
