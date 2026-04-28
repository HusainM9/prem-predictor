"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Vote } from "lucide-react";
import { TeamLogo } from "@/components/play/TeamLogo";
import { UserAvatar } from "@/components/avatar/UserAvatar";
import { FixtureCommunityStats } from "@/components/play/FixtureCommunityStats";
import { useReactions } from "@/hooks/useReactions";
import { ReactionBar } from "@/components/reactions/ReactionBar";
import type { GotwHistoryEntry } from "@/lib/game-of-the-week-history";
import { FaXmark } from "react-icons/fa6";
import { FaCheck } from "react-icons/fa";



export type HistoryPrediction = {
  prediction_id: string;
  fixture_id: string;
  pred_home_goals: number;
  pred_away_goals: number;
  points_awarded: number;
  bonus_exact_score_points?: number;
  bonus_points?: number;
  settled_at?: string | null;
  /** True when the viewer cannot see the predicted score until odds lock or kickoff. */
  prediction_hidden?: boolean;
  fixture: {
    home_team: string;
    away_team: string;
    gameweek: number;
    home_goals: number | null;
    away_goals: number | null;
  } | null;
};

export type GameweekBonus = { bonus_type: string; points: number };

type Props = {
  title: string;
  backHref: string;
  backLabel: string;
  totalPoints: number;
  currentGameweek: number | null;
  selectedGameweek: number;
  onSelectedGameweekChange: (gw: number) => void;
  predictionsForGw: HistoryPrediction[];
  gameweekPoints: number;
  positionChange?: number | null;
  bonusesForGw?: GameweekBonus[];
  gotwEntries?: GotwHistoryEntry[];
  gotwLoading?: boolean;
  gotwError?: string | null;
  titleAvatarTeam?: string | null;
  enablePredictionReactions?: boolean;
};

const MAX_GW = 38;

function outcomeType(p: HistoryPrediction): "exact" | "correct" | "wrong" | "pending" | "hidden" {
  if (p.prediction_hidden) return "hidden";
  if (!p.settled_at) return "pending";
  const bonus = p.bonus_exact_score_points ?? p.bonus_points ?? 0;
  if (bonus > 0) return "exact";
  if ((p.points_awarded ?? 0) > 0) return "correct";
  return "wrong";
}

const BONUS_LABELS: Record<string, string> = {
  underdog_win: "Biggest underdog win",
  correct_7: "7+ correct results",
  all_correct: "All results correct",
  exact_4: "4+ exact scores",
};

export function HistoryView({
  title,
  backHref,
  backLabel,
  totalPoints,
  currentGameweek,
  selectedGameweek,
  onSelectedGameweekChange,
  predictionsForGw,
  gameweekPoints,
  positionChange,
  bonusesForGw = [],
  gotwEntries = [],
  gotwLoading = false,
  gotwError = null,
  titleAvatarTeam = null,
  enablePredictionReactions = true,
}: Props) {
  const [gwInput, setGwInput] = useState(String(selectedGameweek));
  const [historyTab, setHistoryTab] = useState<"matches" | "bonuses" | "gotw">("matches");
  const predictionIds = predictionsForGw.map((p) => p.prediction_id);
  const {
    summaryById: reactionSummaryById,
    pendingById: reactionPendingById,
    react: reactToPrediction,
    message: reactionMessage,
  } = useReactions("prediction", predictionIds);
  useEffect(() => {
    setGwInput(String(selectedGameweek));
  }, [selectedGameweek]);

  const exactCount = predictionsForGw.filter(
    (p) =>
      !p.prediction_hidden &&
      !!p.settled_at &&
      (p.bonus_exact_score_points ?? p.bonus_points ?? 0) > 0
  ).length;
  const correctCount = predictionsForGw.filter(
    (p) => !p.prediction_hidden && !!p.settled_at && (p.points_awarded ?? 0) > 0
  ).length;
  const wrongCount = predictionsForGw.filter(
    (p) => !p.prediction_hidden && !!p.settled_at && (p.points_awarded ?? 0) < 0
  ).length;
  const pendingCount = predictionsForGw.filter((p) => !p.prediction_hidden && !p.settled_at).length;

  const maxGw = currentGameweek ?? MAX_GW;
  const gwNum = Math.max(1, Math.min(maxGw, selectedGameweek));

  const handleGwInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value.replace(/\D/g, "").slice(0, 2);
      setGwInput(v);
      const n = parseInt(v, 10);
      if (Number.isInteger(n) && n >= 1 && n <= MAX_GW) {
        onSelectedGameweekChange(Math.min(n, maxGw));
      }
    },
    [onSelectedGameweekChange, maxGw]
  );

  const syncGwInput = useCallback(() => {
    setGwInput(String(gwNum));
  }, [gwNum]);

  const prevGw = () => {
    const next = Math.max(1, gwNum - 1);
    onSelectedGameweekChange(next);
    setGwInput(String(next));
  };
  const nextGw = () => {
    const next = Math.min(maxGw, gwNum + 1);
    onSelectedGameweekChange(next);
    setGwInput(String(next));
  };

  const thisWeekPoints = gameweekPoints;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-3 py-4 max-sm:px-3 max-sm:py-4 sm:px-4 sm:py-6 md:px-6">
        <div className="mb-4">
          <Link href={backHref} className="inline-flex min-h-[44px] items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            ← {backLabel}
          </Link>
        </div>

        <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-4 shadow-2xl shadow-primary/5 ring-1 ring-primary/10 backdrop-blur sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                History
              </div>
              <div className="flex items-center gap-3">
                <UserAvatar favouriteTeam={titleAvatarTeam} size={34} />
                <h1 className="text-2xl font-black tracking-tight text-foreground max-sm:text-2xl sm:text-3xl">
                  {title}
                </h1>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Review your scoreline record by gameweek, bonuses and Match of the Week picks.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:min-w-[360px]">
              <div className="rounded-xl border border-border/70 bg-background/55 px-3 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Total Points
                </p>
                <p className="mt-1 text-2xl font-black text-foreground">{totalPoints}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/55 px-3 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  GW {gwNum}
                </p>
                <p className={`mt-1 text-2xl font-black ${thisWeekPoints < 0 ? "text-destructive" : "text-primary"}`}>
                  {thisWeekPoints > 0 ? "+" : ""}
                  {thisWeekPoints}
                </p>
              </div>
              <div className="col-span-2 flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/55 px-3 py-3 shadow-sm">
                <button
                  type="button"
                  onClick={prevGw}
                  disabled={gwNum <= 1}
                  className="h-9 w-9 rounded-full border border-border bg-card text-foreground transition hover:border-primary/40 disabled:pointer-events-none disabled:opacity-40"
                  aria-label="Previous gameweek"
                >
                  ←
                </button>
                <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-card/70 px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">GW</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={gwInput}
                    onChange={handleGwInputChange}
                    onBlur={syncGwInput}
                    className="w-9 bg-transparent text-center font-bold text-foreground focus:outline-none focus:ring-0"
                    aria-label="Gameweek number"
                  />
                  <span className="text-xs text-muted-foreground">/ {maxGw}</span>
                </div>
                <button
                  type="button"
                  onClick={nextGw}
                  disabled={gwNum >= maxGw}
                  className="h-9 w-9 rounded-full border border-border bg-card text-foreground transition hover:border-primary/40 disabled:pointer-events-none disabled:opacity-40"
                  aria-label="Next gameweek"
                >
                  →
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-4 sm:gap-3">
          <div className="rounded-xl border border-border/70 bg-card/70 p-3 shadow-lg shadow-black/10 backdrop-blur sm:p-4">
            <p className="text-xl font-black text-primary sm:text-2xl">{gameweekPoints}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Points</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3 shadow-lg shadow-black/10 backdrop-blur sm:p-4">
            <p className="flex items-center gap-1 text-xl font-black text-primary sm:text-2xl">
              <span aria-hidden>🎯</span> {exactCount}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Exact</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3 shadow-lg shadow-black/10 backdrop-blur sm:p-4">
            <p className="flex items-center gap-1 text-xl font-black text-primary sm:text-2xl">
              <span aria-hidden><FaCheck className="text-green-500 text-xxl" /></span> {correctCount}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Correct</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3 shadow-lg shadow-black/10 backdrop-blur sm:p-4">
            <p className="flex items-center gap-1 text-xl font-black text-destructive sm:text-2xl">
              <span aria-hidden><FaXmark className="text-red-500 text-xxl" /></span> {wrongCount}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Wrong</p>
          </div>
        </div>
        {pendingCount > 0 && (
          <p className="mt-3 rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm text-muted-foreground">
            {pendingCount} fixture{pendingCount !== 1 ? "s are" : " is"} unscored and still settling. Scores are updated every 30 minutes.
          </p>
        )}

        {positionChange != null && positionChange !== 0 && (
          <p className="mt-3 flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            <span aria-hidden>{positionChange > 0 ? "↑" : "↓"}</span>
            {positionChange > 0 ? "+" : ""}{positionChange} position
          </p>
        )}

        <div className="mt-6 max-sm:mt-4 sm:mt-8">
          <div className="flex max-w-full w-fit flex-wrap gap-1 rounded-xl border border-border/70 bg-card/70 p-1 shadow-lg shadow-black/10 backdrop-blur">
            <button
              type="button"
              onClick={() => setHistoryTab("matches")}
              className={`min-h-[36px] rounded-md px-3 text-sm font-medium transition-colors ${
                historyTab === "matches"
                  ? "bg-background/80 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Matches
            </button>
            <button
              type="button"
              onClick={() => setHistoryTab("bonuses")}
              className={`min-h-[36px] rounded-md px-3 text-sm font-medium transition-colors ${
                historyTab === "bonuses"
                  ? "bg-background/80 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Bonuses
              {bonusesForGw.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-xs">
                  {bonusesForGw.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setHistoryTab("gotw")}
              className={`inline-flex min-h-[36px] items-center gap-1 rounded-md px-3 text-sm font-medium transition-colors ${
                historyTab === "gotw"
                  ? "bg-background/80 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Vote className="size-3.5 shrink-0 opacity-80" aria-hidden />
              Match of week
            </button>
          </div>

        {historyTab === "matches" && (
        <section className="mt-4">
          <h2 className="flex items-center justify-between rounded-full border border-border/60 bg-card/50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <span>Fixtures</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {predictionsForGw.length} fixture{predictionsForGw.length !== 1 ? "s" : ""}
            </span>
          </h2>

          <ul className="mt-2 list-none space-y-2 p-0 m-0 max-sm:mt-2 sm:mt-3">
            {predictionsForGw.map((p) => {
              const type = outcomeType(p);
              const bonus = p.bonus_exact_score_points ?? p.bonus_points ?? 0;
              const pts = (p.points_awarded ?? 0) + bonus;
              const hasFinalScore =
                p.fixture != null &&
                p.fixture.home_goals != null &&
                p.fixture.away_goals != null &&
                Number.isInteger(p.fixture.home_goals) &&
                Number.isInteger(p.fixture.away_goals);
              const borderColor =
                type === "hidden"
                  ? "border-l-muted"
                  : type === "wrong"
                    ? "border-l-destructive"
                    : type === "pending"
                      ? "border-l-muted"
                      : "border-l-primary";
              return (
                <li key={p.prediction_id}>
                  <div
                    className={`relative overflow-hidden rounded-2xl border border-border/80 bg-card/85 p-3 pl-4 border-l-4 text-center shadow-xl shadow-black/15 ring-1 ring-primary/5 sm:p-4 sm:pl-5 ${borderColor}`}
                  >
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent" />
                    {p.fixture ? (
                      <>
                        <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background/50 p-3 shadow-inner shadow-black/10 sm:gap-3">
                          <div className="flex items-center gap-1 max-sm:gap-1 sm:gap-2">
                            <TeamLogo teamName={p.fixture.home_team} size={28} />
                            <span className="font-semibold text-foreground max-sm:text-xs sm:text-sm">
                              {p.fixture.home_team}
                            </span>
                          </div>
                          {p.fixture.home_goals != null && p.fixture.away_goals != null ? (
                            <span className="rounded-xl border border-primary/35 bg-card px-3 py-1 text-sm font-black tabular-nums text-foreground shadow-lg shadow-primary/10 sm:text-base">
                              {p.fixture.home_goals} – {p.fixture.away_goals}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
                          <div className="flex items-center gap-1 max-sm:gap-1 sm:gap-2">
                            <TeamLogo teamName={p.fixture.away_team} size={28} />
                            <span className="font-semibold text-foreground max-sm:text-xs sm:text-sm">
                              {p.fixture.away_team}
                            </span>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
                            type === "hidden"
                              ? "border-border bg-muted/40 text-muted-foreground"
                              : type === "wrong"
                                ? "border-destructive/40 bg-destructive/15 text-destructive"
                                : type === "pending"
                                  ? "border-border bg-muted/40 text-muted-foreground"
                                  : "border-primary/40 bg-primary/15 text-primary"
                          }`}>
                            {type === "hidden"
                              ? "Hidden"
                              : type === "pending"
                                ? "Unscored"
                                : type === "wrong"
                                  ? pts
                                  : `+${pts}`}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/45 px-3 py-2">
                          {type === "hidden" ? (
                            <span className="text-sm text-muted-foreground">
                              Prediction hidden until odds lock or kickoff (this user keeps picks private before then).
                            </span>
                          ) : (
                            <>
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wide max-sm:text-[10px] sm:text-xs">
                                Predicted {p.pred_home_goals}–{p.pred_away_goals}
                              </span>
                              {type === "exact" && (
                                <span className="text-primary text-sm font-medium flex items-center justify-center gap-1">
                                  <span aria-hidden>🎯</span> Exact score
                                </span>
                              )}
                              {type === "correct" && (
                                <span className="text-primary text-sm font-medium flex items-center justify-center gap-1">
                                  <span aria-hidden><FaCheck className="text-green-500 text-xxl" /></span> Correct result
                                </span>
                              )}
                              {type === "wrong" && (
                                <span className="text-destructive text-sm font-medium flex items-center justify-center gap-1">
                                  <span aria-hidden><FaXmark className="text-red-500 text-xxl" /></span> Wrong ({p.points_awarded ?? 0} pts)
                                </span>
                              )}
                              {type === "pending" && (
                                <span className="text-muted-foreground text-sm font-medium">
                                  Settling in progress (points not final yet)
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        {enablePredictionReactions && (
                          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                            <ReactionBar
                              summary={reactionSummaryById[p.prediction_id]}
                              pending={reactionPendingById[p.prediction_id]}
                              onReact={(emoji) => {
                                void reactToPrediction(p.prediction_id, emoji);
                              }}
                            />
                          </div>
                        )}
                        <div className="mt-3 border-t border-border/60 pt-3">
                          <FixtureCommunityStats fixtureId={p.fixture_id} enabled={hasFinalScore} />
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Fixture {p.fixture_id}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {exactCount >= 4 && predictionsForGw.length > 0 && (
            <div className="mt-4 rounded-xl bg-primary/15 border border-primary/30 px-4 py-3 text-primary text-sm font-medium">
              {exactCount} exact score{exactCount !== 1 ? "s" : ""} in Gameweek {selectedGameweek}, outstanding performance!
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            Upcoming fixtures may appear with predictions hidden depending on that player&apos;s privacy settings. Past
            results show as usual. Switch gameweeks to view other rounds.
          </p>
          {reactionMessage && (
            <p className="mt-2 text-sm text-muted-foreground">{reactionMessage}</p>
          )}
        </section>
        )}

        {historyTab === "bonuses" && (
          <section className="mt-4">
            <h2 className="rounded-full border border-border/60 bg-card/50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Gameweek {selectedGameweek} bonuses
            </h2>
            {bonusesForGw.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-border/70 bg-card/70 p-4 text-sm text-muted-foreground shadow-lg shadow-black/10 backdrop-blur">
                No bonuses earned for this gameweek. Bonuses are applied after the gameweek is settled.
              </p>
            ) : (
              <ul className="mt-2 list-none space-y-2 p-0 m-0">
                {bonusesForGw.map((b, i) => (
                  <li
                    key={`${b.bonus_type}-${i}`}
                    className="rounded-2xl border border-border/80 bg-card/85 p-3 pl-4 border-l-4 border-l-primary shadow-xl shadow-black/15 ring-1 ring-primary/5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {BONUS_LABELS[b.bonus_type] ?? b.bonus_type}
                      </span>
                      <span className="text-sm font-semibold text-primary">
                        +{b.points} pts
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {historyTab === "gotw" && (
          <section className="mt-4">
            <h2 className="rounded-full border border-border/60 bg-card/50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Match of the week
            </h2>
            <p className="mt-3 rounded-2xl border border-border/70 bg-card/70 p-4 text-sm text-muted-foreground shadow-lg shadow-black/10 backdrop-blur">
              Community pick per gameweek (votes close 24h before the first kickoff). Correct predictions on the winning
              match earn +15 pts when the gameweek is scored.
            </p>
            {gotwError && <p className="mt-3 text-sm text-destructive">{gotwError}</p>}
            {gotwLoading && !gotwError && (
              <p className="mt-3 text-sm text-muted-foreground">Loading match-of-the-week history…</p>
            )}
            {!gotwLoading && !gotwError && gotwEntries.length === 0 && (
              <p className="mt-3 rounded-2xl border border-border/70 bg-card/70 p-4 text-sm text-muted-foreground shadow-lg shadow-black/10 backdrop-blur">No fixtures for this season yet.</p>
            )}
            {!gotwLoading && !gotwError && gotwEntries.length > 0 && (
              <ul className="mt-4 list-none space-y-2 p-0 m-0">
                {gotwEntries.map((row) => {
                  const isSelectedGw = row.gameweek === gwNum;
                  const winnerLabel = row.winner
                    ? `${row.winner.home_team} vs ${row.winner.away_team}`
                    : row.voting_closed
                      ? "No winner (no votes)"
                      : "—";
                  const myLabel = row.my_vote
                    ? `${row.my_vote.home_team} vs ${row.my_vote.away_team}`
                    : "—";
                  let resultLabel = "—";
                  if (!row.voting_closed) resultLabel = "Voting open";
                  else if (row.winner && row.picked_winner === true) resultLabel = "+15 eligible";
                  else if (row.winner && row.picked_winner === false) resultLabel = "Different pick";
                  else if (row.winner && row.my_vote == null) resultLabel = "Didn't vote";
                  else if (!row.winner && row.voting_closed) resultLabel = "No community pick";

                  return (
                    <li
                      key={row.gameweek}
                      className={`rounded-2xl border border-border/80 bg-card/85 p-3 shadow-xl shadow-black/15 ring-1 ring-primary/5 sm:p-4 ${
                        isSelectedGw ? "ring-2 ring-primary/40" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-2 text-sm font-semibold text-foreground">
                        <span>GW{row.gameweek}</span>
                        {isSelectedGw && (
                          <span className="rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                            Selected above
                          </span>
                        )}
                      </div>
                      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Winner</dt>
                          <dd className="mt-0.5 font-medium text-foreground">{winnerLabel}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Your pick</dt>
                          <dd className="mt-0.5 font-medium text-foreground">{myLabel}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Bonus</dt>
                          <dd className="mt-0.5 text-muted-foreground">{resultLabel}</dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        </div>
      </div>
    </main>
  );
}
