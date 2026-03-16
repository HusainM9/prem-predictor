"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TeamLogo } from "@/components/play/TeamLogo";
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
};

const MAX_GW = 38;

function outcomeType(p: HistoryPrediction): "exact" | "correct" | "wrong" | "pending" {
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
}: Props) {
  const [gwInput, setGwInput] = useState(String(selectedGameweek));
  const [historyTab, setHistoryTab] = useState<"matches" | "bonuses">("matches");
  useEffect(() => {
    setGwInput(String(selectedGameweek));
  }, [selectedGameweek]);

  const exactCount = predictionsForGw.filter(
    (p) => !!p.settled_at && (p.bonus_exact_score_points ?? p.bonus_points ?? 0) > 0
  ).length;
  const correctCount = predictionsForGw.filter((p) => !!p.settled_at && (p.points_awarded ?? 0) > 0).length;
  const wrongCount = predictionsForGw.filter((p) => !!p.settled_at && (p.points_awarded ?? 0) < 0).length;
  const pendingCount = predictionsForGw.filter((p) => !p.settled_at).length;

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
      <div className="mx-auto max-w-3xl px-3 py-4 max-sm:px-3 max-sm:py-4 sm:px-4 sm:py-6 md:px-6">
        <div className="mb-4 flex items-center gap-2 max-sm:mb-3 max-sm:gap-2 sm:mb-6 sm:gap-4">
          <Link href={backHref} className="text-muted-foreground hover:text-foreground transition-colors max-sm:text-sm">
            ← {backLabel}
          </Link>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold text-foreground max-sm:text-sm">Scoreline</span>
        </div>

        <h1 className="mb-4 text-xl font-bold text-foreground max-sm:mb-3 max-sm:text-lg sm:mb-6 sm:text-2xl">{title}</h1>

        <div className="flex flex-col gap-4 max-sm:gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div>
            <p className="text-3xl font-bold text-foreground max-sm:text-2xl sm:text-4xl">{totalPoints}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide max-sm:text-xs sm:text-sm">Total pts</p>
            {thisWeekPoints !== 0 && (
              <p
                className={`text-sm mt-1 ${
                  thisWeekPoints > 0 ? "text-primary" : "text-destructive"
                }`}
              >
                {thisWeekPoints > 0 ? "+" : ""}
                {thisWeekPoints} this week
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 max-sm:gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={prevGw}
              disabled={gwNum <= 1}
              className="h-9 w-9 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none max-sm:h-8 max-sm:w-8 sm:h-10 sm:w-10"
              aria-label="Previous gameweek"
            >
              ←
            </button>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 max-sm:px-2 max-sm:py-1.5 sm:px-3 sm:py-2">
              <span className="text-xs text-muted-foreground max-sm:text-xs sm:text-sm">GW</span>
              <input
                type="text"
                inputMode="numeric"
                value={gwInput}
                onChange={handleGwInputChange}
                onBlur={syncGwInput}
                className="w-8 bg-transparent text-center text-foreground font-semibold focus:outline-none focus:ring-0 max-sm:w-7 max-sm:text-sm sm:w-10 sm:text-base"
                aria-label="Gameweek number"
              />
              <span className="text-xs text-muted-foreground max-sm:text-xs sm:text-sm">/ {maxGw}</span>
            </div>
            <button
              type="button"
              onClick={nextGw}
              disabled={gwNum >= maxGw}
              className="h-9 w-9 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none max-sm:h-8 max-sm:w-8 sm:h-10 sm:w-10"
              aria-label="Next gameweek"
            >
              →
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 max-sm:mt-4 max-sm:gap-2 sm:mt-6 sm:grid-cols-4 sm:gap-3">
          <div className="rounded-lg border border-border bg-card p-3 max-sm:p-3 sm:p-4">
            <p className="text-xl font-bold text-primary max-sm:text-lg sm:text-2xl">{gameweekPoints}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground uppercase tracking-wide max-sm:text-[10px] sm:text-xs">Points</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 max-sm:p-3 sm:p-4">
            <p className="flex items-center gap-1 text-xl font-bold text-primary max-sm:text-lg sm:text-2xl">
              <span aria-hidden>🎯</span> {exactCount}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground uppercase tracking-wide max-sm:text-[10px] sm:text-xs">Exact</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 max-sm:p-3 sm:p-4">
            <p className="flex items-center gap-1 text-xl font-bold text-primary max-sm:text-lg sm:text-2xl">
              <span aria-hidden><FaCheck className="text-green-500 text-xxl" /></span> {correctCount}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground uppercase tracking-wide max-sm:text-[10px] sm:text-xs">Correct</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 max-sm:p-3 sm:p-4">
            <p className="flex items-center gap-1 text-xl font-bold text-destructive max-sm:text-lg sm:text-2xl">
              <span aria-hidden><FaXmark className="text-red-500 text-xxl" /></span> {wrongCount}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground uppercase tracking-wide max-sm:text-[10px] sm:text-xs">Wrong</p>
          </div>
        </div>
        {pendingCount > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {pendingCount} fixture{pendingCount !== 1 ? "s are" : " is"} unscored and still settling. Scores are applied after all matches finish and at least 1 hour passes from the final provider update.
          </p>
        )}

        {positionChange != null && positionChange !== 0 && (
          <p className="mt-3 text-sm text-primary flex items-center gap-1">
            <span aria-hidden>{positionChange > 0 ? "↑" : "↓"}</span>
            {positionChange > 0 ? "+" : ""}{positionChange} position
          </p>
        )}

        <div className="mt-6 max-sm:mt-4 sm:mt-8">
          <div className="flex rounded-lg border border-border bg-muted/50 p-0.5 w-fit">
            <button
              type="button"
              onClick={() => setHistoryTab("matches")}
              className={`min-h-[36px] rounded-md px-3 text-sm font-medium transition-colors ${
                historyTab === "matches"
                  ? "bg-background text-foreground shadow-sm"
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
                  ? "bg-background text-foreground shadow-sm"
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
          </div>

        {historyTab === "matches" && (
        <section className="mt-4">
          <h2 className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-foreground max-sm:text-xs sm:text-sm">
            <span>Fixtures</span>
            <span className="font-normal text-muted-foreground max-sm:text-xs sm:text-sm">
              {predictionsForGw.length} fixture{predictionsForGw.length !== 1 ? "s" : ""}
            </span>
          </h2>

          <ul className="mt-2 list-none space-y-2 p-0 m-0 max-sm:mt-2 sm:mt-3">
            {predictionsForGw.map((p) => {
              const type = outcomeType(p);
              const bonus = p.bonus_exact_score_points ?? p.bonus_points ?? 0;
              const pts = (p.points_awarded ?? 0) + bonus;
              const borderColor =
                type === "wrong" ? "border-l-destructive" : type === "pending" ? "border-l-muted" : "border-l-primary";
              return (
                <li key={p.prediction_id}>
                  <div
                    className={`rounded-lg border border-border bg-card p-3 pl-4 border-l-4 text-center max-sm:p-3 max-sm:pl-4 sm:p-4 sm:pl-5 ${borderColor}`}
                  >
                    {p.fixture ? (
                      <>
                        <div className="flex flex-wrap items-center justify-center gap-1.5 max-sm:gap-1.5 sm:gap-3">
                          <div className="flex items-center gap-1 max-sm:gap-1 sm:gap-2">
                            <TeamLogo teamName={p.fixture.home_team} size={28} />
                            <span className="font-semibold text-foreground max-sm:text-xs sm:text-sm">
                              {p.fixture.home_team}
                            </span>
                          </div>
                          {p.fixture.home_goals != null && p.fixture.away_goals != null ? (
                            <span className="font-bold text-foreground max-sm:text-sm sm:text-base">
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
                          <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${
                            type === "wrong"
                              ? "bg-destructive/20 text-destructive"
                              : type === "pending"
                                ? "bg-muted text-muted-foreground"
                                : "bg-primary/20 text-primary"
                          }`}>
                            {type === "pending" ? "Unscored" : type === "wrong" ? pts : `+${pts}`}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 border-t border-border pt-2 max-sm:mt-2 max-sm:gap-1.5 max-sm:pt-2 sm:mt-3 sm:gap-2 sm:pt-3">
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
            <div className="mt-4 rounded-lg bg-primary/15 border border-primary/30 px-4 py-3 text-primary text-sm font-medium">
              {exactCount} exact score{exactCount !== 1 ? "s" : ""} in Gameweek {selectedGameweek}, outstanding performance!
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            Only completed matches are shown. Switch gameweeks to view past results.
          </p>
        </section>
        )}

        {historyTab === "bonuses" && (
          <section className="mt-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground max-sm:text-xs sm:text-sm">
              Gameweek {selectedGameweek} bonuses
            </h2>
            {bonusesForGw.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No bonuses earned for this gameweek. Bonuses are applied after the gameweek is settled.
              </p>
            ) : (
              <ul className="mt-2 list-none space-y-2 p-0 m-0">
                {bonusesForGw.map((b, i) => (
                  <li
                    key={`${b.bonus_type}-${i}`}
                    className="rounded-lg border border-border bg-card p-3 pl-4 border-l-4 border-l-primary"
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

        </div>
      </div>
    </main>
  );
}
