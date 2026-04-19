"use client";

import { useEffect, useRef, useState } from "react";
import data from "@emoji-mart/data";
import { Picker } from "emoji-mart";
import { QUICK_REACTION_EMOJIS, createEmptyReactionSummary, type ReactionSummary } from "@/lib/reactions";
import { cn } from "@/lib/utils";

type ReactionBarProps = {
  summary?: ReactionSummary;
  pending?: boolean;
  disabled?: boolean;
  onReact: (emoji: string) => void;
  className?: string;
  compact?: boolean;
};

export function ReactionBar({
  summary = createEmptyReactionSummary(),
  pending = false,
  disabled = false,
  onReact,
  className,
  compact = false,
}: ReactionBarProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pickerHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !pickerHostRef.current) return;
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
        setOpen(false);
        onReact(emoji.native);
      },
    });
    host.appendChild(picker as unknown as Node);
    return () => {
      host.replaceChildren();
    };
  }, [open, onReact]);

  const displayedQuick = [...QUICK_REACTION_EMOJIS].sort((a, b) => {
    const aCount = summary.counts[a] ?? 0;
    const bCount = summary.counts[b] ?? 0;
    if (bCount !== aCount) return bCount - aCount;
    return QUICK_REACTION_EMOJIS.indexOf(a) - QUICK_REACTION_EMOJIS.indexOf(b);
  });

  const extraUsed = Object.keys(summary.counts).filter(
    (emoji) =>
      (summary.counts[emoji] ?? 0) > 0 &&
      !displayedQuick.includes(emoji as (typeof QUICK_REACTION_EMOJIS)[number])
  );

  const chipBase = compact
    ? "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-colors"
    : "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors";

  return (
    <div ref={containerRef} className={cn("relative flex items-center gap-1.5", className)}>
      {displayedQuick.map((emoji) => {
        const count = summary.counts[emoji] ?? 0;
        const active = summary.myEmoji === emoji;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(emoji)}
            disabled={disabled || pending}
            className={cn(
              chipBase,
              active
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-muted/40 text-foreground hover:bg-muted/70",
              (disabled || pending) && "cursor-not-allowed opacity-60"
            )}
            aria-label={`React with ${emoji}`}
          >
            <span aria-hidden>{emoji}</span>
            {count > 0 && <span className="font-medium">{count}</span>}
          </button>
        );
      })}
      {extraUsed.map((emoji) => {
        const count = summary.counts[emoji] ?? 0;
        const active = summary.myEmoji === emoji;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(emoji)}
            disabled={disabled || pending}
            className={cn(
              chipBase,
              active
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-muted/40 text-foreground hover:bg-muted/70",
              (disabled || pending) && "cursor-not-allowed opacity-60"
            )}
            aria-label={`React with ${emoji}`}
          >
            <span aria-hidden>{emoji}</span>
            {count > 0 && <span className="font-medium">{count}</span>}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || pending}
        className={cn(
          chipBase,
          "border-dashed",
          open
            ? "border-primary bg-primary/15 text-primary"
            : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/60",
          (disabled || pending) && "cursor-not-allowed opacity-60"
        )}
        aria-label="More emojis"
      >
        +
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+0.4rem)] z-20 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div ref={pickerHostRef} />
        </div>
      )}
    </div>
  );
}

