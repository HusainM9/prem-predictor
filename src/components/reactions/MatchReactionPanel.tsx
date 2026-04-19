"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import data from "@emoji-mart/data";
import { Picker } from "emoji-mart";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactionSummary } from "@/lib/reactions";
import { cn } from "@/lib/utils";

type MatchReactionPanelProps = {
  summary?: ReactionSummary;
  pending?: boolean;
  disabled?: boolean;
  onReact: (emoji: string) => void;
};

export function MatchReactionPanel({
  summary,
  pending = false,
  disabled = false,
  onReact,
}: MatchReactionPanelProps) {
  const [openPicker, setOpenPicker] = useState(false);
  const [sectionIdx, setSectionIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pickerHostRef = useRef<HTMLDivElement | null>(null);
  const safeSummary: ReactionSummary = summary ?? { counts: {}, total: 0, myEmoji: null };

  const sortedUsed = useMemo(
    () =>
      Object.entries(safeSummary.counts)
        .filter(([, count]) => count > 0)
        .sort((a, b) => {
          if (b[1] !== a[1]) return b[1] - a[1];
          return a[0].localeCompare(b[0]);
        }),
    [safeSummary.counts]
  );

  const topFive = sortedUsed.slice(0, 5);
  const topTwenty = sortedUsed.slice(0, 20);
  const sections = [topFive, topTwenty] as const;
  const displayed = sections[sectionIdx] ?? topFive;

  useEffect(() => {
    if (!openPicker) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpenPicker(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [openPicker]);

  useEffect(() => {
    if (!openPicker || !pickerHostRef.current) return;
    const host = pickerHostRef.current;
    host.replaceChildren();
    const picker = new Picker({
      data,
      theme: "auto",
      previewPosition: "none",
      skinTonePosition: "none",
      maxFrequentRows: 1,
      perLine: 8,
      onEmojiSelect: (emoji: { native?: string }) => {
        if (!emoji?.native) return;
        setOpenPicker(false);
        onReact(emoji.native);
      },
    });
    host.appendChild(picker as unknown as Node);
    return () => {
      host.replaceChildren();
    };
  }, [onReact, openPicker]);

  return (
    <div ref={containerRef} className="relative space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center rounded-md border border-border bg-muted/30 p-0.5">
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            onClick={() => setSectionIdx((idx) => Math.max(0, idx - 1))}
            disabled={sectionIdx === 0}
            aria-label="Previous reaction section"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            onClick={() => setSectionIdx((idx) => Math.min(sections.length - 1, idx + 1))}
            disabled={sectionIdx === sections.length - 1}
            aria-label="Next reaction section"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setOpenPicker((v) => !v)}
          disabled={disabled || pending}
          className={cn(
            "rounded-full border border-dashed border-border bg-muted/20 px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60",
            (disabled || pending) && "cursor-not-allowed opacity-60"
          )}
          aria-label="Add reaction"
        >
          +
        </button>
      </div>

      {displayed.length === 0 ? (
        <p className="text-xs text-muted-foreground">No reactions yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {displayed.map(([emoji, count]) => {
            const active = safeSummary.myEmoji === emoji;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(emoji)}
                disabled={disabled || pending}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors",
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-muted/40 text-foreground hover:bg-muted/70",
                  (disabled || pending) && "cursor-not-allowed opacity-60"
                )}
                aria-label={`React with ${emoji}`}
              >
                <span aria-hidden>{emoji}</span>
                <span className="font-medium">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {openPicker && (
        <div className="absolute left-0 top-[calc(100%+0.35rem)] z-20 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div ref={pickerHostRef} />
        </div>
      )}
    </div>
  );
}

