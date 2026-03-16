"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Vote, ChevronDown, ChevronUp } from "lucide-react";

type FixtureOption = { id: string; home_team: string; away_team: string; kickoff_time: string };

type LastVoteWinner = { gameweek: number; fixture_id: string; home_team: string; away_team: string } | null;

type GotwState = {
  voting_open: boolean;
  first_kickoff: string | null;
  fixtures: FixtureOption[];
  my_vote_fixture_id: string | null;
  gameweek: number | null;
  season: string;
  current_vote_winner: LastVoteWinner;
  last_vote_winner: LastVoteWinner;
};

type Props = {
  /** Pass to force a specific gameweek; otherwise uses API default (next/current). */
  gameweek?: number | null;
  /** Compact = single line + link; full = list of fixtures and vote buttons */
  variant?: "compact" | "full";
  /** Notify parent of the last settled match-of-the-week winner (for highlighting). */
  onLastWinnerChange?: (fixtureId: string | null) => void;
  className?: string;
};

export function VoteForMatchOfTheWeek({
  gameweek,
  variant = "full",
  onLastWinnerChange,
  className,
}: Props) {
  const [state, setState] = useState<GotwState | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setState(null);
      setLoading(false);
      return;
    }
    const url = new URL("/api/game-of-the-week", window.location.origin);
    if (gameweek != null) url.searchParams.set("gameweek", String(gameweek));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setState(null);
      setLoading(false);
      return;
    }
    const nextState: GotwState = {
      voting_open: data.voting_open ?? false,
      first_kickoff: data.first_kickoff ?? null,
      fixtures: data.fixtures ?? [],
      my_vote_fixture_id: data.my_vote_fixture_id ?? null,
      gameweek: data.gameweek ?? null,
      season: data.season ?? "2025/26",
      current_vote_winner: data.current_vote_winner ?? null,
      last_vote_winner: data.last_vote_winner ?? null,
    };
    setState(nextState);
    if (onLastWinnerChange) {
      onLastWinnerChange(nextState.current_vote_winner?.fixture_id ?? nextState.last_vote_winner?.fixture_id ?? null);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [gameweek]);

  const vote = async (fixtureId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token || !state?.gameweek) return;
    setVoting(fixtureId);
    setMessage(null);
    try {
      const res = await fetch("/api/game-of-the-week/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fixture_id: fixtureId,
          gameweek: state.gameweek,
          season: state.season,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage("Vote saved!");
        setState((s) => (s ? { ...s, my_vote_fixture_id: fixtureId } : null));
      } else {
        setMessage(data.error ?? "Failed to vote");
      }
    } catch {
      setMessage("Request failed");
    } finally {
      setVoting(null);
    }
  };

  if (loading || !state) {
    if (variant === "compact") {
      return (
        <p className={`text-sm text-muted-foreground ${className ?? ""}`}>
          Vote for match of the week…
        </p>
      );
    }
    return (
      <div className={`rounded-lg border border-border bg-card p-4 ${className ?? ""}`}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className ?? ""}`}>
        <div className="flex items-center gap-2">
          <Vote className="size-4 text-muted-foreground" aria-hidden />
          {state.voting_open ? (
            <a
              href="/play#vote-gotw"
              className="text-sm font-medium text-primary hover:underline"
            >
              Vote for match of the week
            </a>
          ) : (
            <span className="text-sm text-muted-foreground">
              Voting closed for GW{state.gameweek}
            </span>
          )}
        </div>
        {state.last_vote_winner && (
          <span className="text-xs text-muted-foreground">
            Last: GW{state.last_vote_winner.gameweek} {state.last_vote_winner.home_team} vs {state.last_vote_winner.away_team}
          </span>
        )}
        {state.current_vote_winner && (
          <span className="text-xs text-primary">
            Settled: GW{state.current_vote_winner.gameweek} {state.current_vote_winner.home_team} vs {state.current_vote_winner.away_team}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      id="vote-gotw"
      className={`rounded-lg border border-border bg-card p-4 ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Vote className="size-4" aria-hidden />
          <span className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Vote for match of the week
          </span>
        </div>
        <span className="text-muted-foreground">
          {expanded ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
        </span>
      </button>
      {state.last_vote_winner && (
        <p className="mt-1 text-xs text-muted-foreground">
          Game of the Week: GW{state.last_vote_winner.gameweek} <strong className="text-foreground">{state.last_vote_winner.home_team} vs {state.last_vote_winner.away_team}</strong>
        </p>
      )}
      {state.current_vote_winner && (
        <p className="mt-1 text-xs text-primary">
          Settled for GW{state.current_vote_winner.gameweek}:{" "}
          <strong className="text-foreground">
            {state.current_vote_winner.home_team} vs {state.current_vote_winner.away_team}
          </strong>
        </p>
      )}
      {state.voting_open ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            GW{state.gameweek} · Voting closes 24 hours before the first match kicksoff. Correct predictions on the winning match get +15 pts.
          </p>
          {expanded && (
            <>
              {state.fixtures.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No fixtures for this gameweek yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {state.fixtures.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-foreground">
                        {f.home_team} vs {f.away_team}
                      </span>
                      <Button
                        size="sm"
                        variant={state.my_vote_fixture_id === f.id ? "default" : "outline"}
                        onClick={() => vote(f.id)}
                        disabled={voting !== null}
                      >
                        {voting === f.id ? "Saving…" : state.my_vote_fixture_id === f.id ? "Your vote" : "Vote"}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {message && (
                <p className={`mt-2 text-sm ${message.startsWith("Vote") ? "text-primary" : "text-destructive"}`}>
                  {message}
                </p>
              )}
            </>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Voting has closed for GW{state.gameweek}. It closes 24 hours before first kickoff. Voting for the next gameweek will open here.
        </p>
      )}
    </div>
  );
}
