"use client";

import { useRef, type Dispatch, type SetStateAction } from "react";
import { potentialPoints } from "@/lib/scoring/points";
import { TeamDisplay } from "@/components/TeamDisplay";
import { FixtureCommunityStats } from "@/components/play/FixtureCommunityStats";

type Pick = "H" | "D" | "A";

export type PlayFixtureRow = {
  id: string;
  kickoff_time: string;
  home_team: string;
  away_team: string;
  status: string;
  gameweek: number;
  home_goals: number | null;
  away_goals: number | null;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  odds_locked_at: string | null;
  odds_home_current: number | null;
  odds_draw_current: number | null;
  odds_away_current: number | null;
  odds_current_updated_at: string | null;
  odds_current_bookmaker: string | null;
};

export type PredictionMeta = {
  points_awarded: number;
  bonus_exact_score_points: number;
  settled_at: string | null;
};

function derivedPick(hg: number, ag: number): Pick {
  if (hg > ag) return "H";
  if (ag > hg) return "A";
  return "D";
}

function parseGoal(s: string | undefined): number {
  const t = (s ?? "").trim();
  return t === "" ? 0 : Number(t);
}

type Props = {
  f: PlayFixtureRow;
  nowMs: number;
  homeGoals: Record<string, string>;
  awayGoals: Record<string, string>;
  setHomeGoals: Dispatch<SetStateAction<Record<string, string>>>;
  setAwayGoals: Dispatch<SetStateAction<Record<string, string>>>;
  saving: Record<string, boolean>;
  msg: Record<string, string>;
  savePrediction: (fixture: PlayFixtureRow) => Promise<void>;
  alreadySavedFixtureIds: Set<string>;
  lastSavedScores: Record<string, { h: number; a: number }>;
  matchOfTheWeekFixtureId: string | null;
  meta?: PredictionMeta;
};

export function PlayMatchCard({
  f,
  nowMs,
  homeGoals,
  awayGoals,
  setHomeGoals,
  setAwayGoals,
  saving,
  msg,
  savePrediction,
  alreadySavedFixtureIds,
  lastSavedScores,
  matchOfTheWeekFixtureId,
  meta,
}: Props) {
  const homeInputRef = useRef<HTMLInputElement | null>(null);
  const awayInputRef = useRef<HTMLInputElement | null>(null);
  const isMatchOfTheWeek = matchOfTheWeekFixtureId === f.id;
  const locked = !!f.odds_locked_at;
  const statusLower = (f.status ?? "").toLowerCase();
  const kickoffMs = new Date(f.kickoff_time).getTime();
  const kickoffPassed = kickoffMs <= nowMs;
  const isScheduled = statusLower === "scheduled";
  /** Editable until odds lock or kickoff — after lock, card is read-only with saved line. */
  const editable = isScheduled && !kickoffPassed && !locked;

  const hgActual = f.home_goals;
  const agActual = f.away_goals;
  const hasFinalScore =
    typeof hgActual === "number" &&
    typeof agActual === "number" &&
    Number.isInteger(hgActual) &&
    Number.isInteger(agActual) &&
    statusLower === "finished";

  const oddsSource = locked
    ? "locked"
    : f.odds_home_current != null &&
        f.odds_draw_current != null &&
        f.odds_away_current != null
      ? "current"
      : "none";
  const oddsH = locked ? f.odds_home : f.odds_home_current;
  const oddsD = locked ? f.odds_draw : f.odds_draw_current;
  const oddsA = locked ? f.odds_away : f.odds_away_current;

  const hgStr = homeGoals[f.id];
  const agStr = awayGoals[f.id];
  const hasInput = (hgStr ?? "").trim() !== "" && (agStr ?? "").trim() !== "";
  const hg = parseGoal(hgStr);
  const ag = parseGoal(agStr);
  const valid =
    Number.isInteger(hg) && hg >= 0 && Number.isInteger(ag) && ag >= 0;
  const pick = valid ? derivedPick(hg, ag) : null;
  const oddsForPick = pick === "H" ? oddsH : pick === "D" ? oddsD : oddsA;
  const { resultPoints, exactScoreBonus, wrongLoss } =
    oddsForPick != null
      ? potentialPoints(oddsForPick)
      : { resultPoints: 0, exactScoreBonus: 0, wrongLoss: -10 };
  const correctPointsWithGotw = isMatchOfTheWeek ? resultPoints + 15 : resultPoints;
  const exactScoreBonusWithGotw = isMatchOfTheWeek ? exactScoreBonus + 15 : exactScoreBonus;

  const saved = alreadySavedFixtureIds.has(f.id);
  const lastSaved = lastSavedScores[f.id];
  const currentMatchesSaved =
    saved && lastSaved != null && hg === lastSaved.h && ag === lastSaved.a;
  const hasUnsavedChanges = hasInput && !currentMatchesSaved;

  let barColor = "border-l-transparent";
  if (hasFinalScore) {
    const totalPts = (meta?.points_awarded ?? 0) + (meta?.bonus_exact_score_points ?? 0);
    const exact = (meta?.bonus_exact_score_points ?? 0) > 0;
    if (exact) barColor = "border-l-primary bg-primary/5";
    else if (totalPts > 0) barColor = "border-l-primary";
    else if (meta?.settled_at) barColor = "border-l-destructive";
    else barColor = "border-l-muted";
  } else if (isMatchOfTheWeek) {
    barColor = "border-l-primary bg-primary/5";
  } else if (currentMatchesSaved) {
    barColor = "border-l-primary";
  } else if (hasUnsavedChanges) {
    barColor = "border-l-warning";
  }

  const actualPick =
    hasFinalScore ? derivedPick(hgActual, agActual) : null;
  const predPick = valid ? derivedPick(hg, ag) : null;
  const resultCorrect =
    hasFinalScore && actualPick != null && predPick != null && predPick === actualPick;
  const exactHit =
    hasFinalScore &&
    hg === hgActual &&
    ag === agActual;

  const settled = !!meta?.settled_at;

  return (
    <div className={`rounded-lg border border-border bg-card p-4 pl-5 border-l-4 ${barColor}`}>
      <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
        {oddsH != null && oddsD != null && oddsA != null ? (
          <>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
              H {oddsH.toFixed(2)}
            </span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
              D {oddsD.toFixed(2)}
            </span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
              A {oddsA.toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground">
              {locked ? "Locked" : oddsSource === "current" ? "● Live odds" : ""}
            </span>
            {isMatchOfTheWeek && (
              <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                Match of the week
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">Odds not available yet</span>
        )}
      </div>

      {hasFinalScore && (
        <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="rounded-md bg-muted px-2 py-1 font-semibold text-foreground">
            Final {hgActual} – {agActual}
          </span>
          {settled && (
            <span
              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                exactHit
                  ? "bg-primary/20 text-primary"
                  : resultCorrect
                    ? "bg-primary/15 text-primary"
                    : "bg-destructive/15 text-destructive"
              }`}
            >
              {exactHit ? "Exact score" : resultCorrect ? "Correct result" : "Wrong"}
            </span>
          )}
          {!settled && (
            <span className="text-xs text-muted-foreground">Awaiting settlement</span>
          )}
          {settled && (
            <span className="text-xs font-medium text-primary">
              {(meta?.points_awarded ?? 0) + (meta?.bonus_exact_score_points ?? 0)} pts
            </span>
          )}
        </div>
      )}

      <div className="flex min-h-[4rem] flex-nowrap items-center justify-center gap-2 max-sm:min-h-[4rem] max-sm:gap-2 sm:gap-2.5 md:gap-3">
        <div className="flex min-w-[64px] shrink items-center justify-end max-sm:min-w-[64px] sm:min-w-[72px]">
          <TeamDisplay teamName={f.home_team} size={32} align="end" layout="abbr" />
        </div>
        <input
          ref={homeInputRef}
          value={homeGoals[f.id] ?? ""}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "").slice(0, 2);
            setHomeGoals((h) => ({ ...h, [f.id]: val }));
            if (val.length === 1) {
              awayInputRef.current?.focus();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (editable) void savePrediction(f);
            }
          }}
          inputMode="numeric"
          placeholder="0"
          disabled={!editable}
          aria-label="Home score"
          className="h-10 w-10 shrink-0 touch-manipulation rounded-md border-2 border-primary bg-background/50 text-center text-base font-semibold text-foreground max-sm:h-10 max-sm:w-10 sm:h-11 sm:w-11 md:min-h-[44px] md:w-12 md:text-lg disabled:cursor-not-allowed disabled:opacity-70"
        />
        <span className="shrink-0 font-semibold text-muted-foreground max-sm:text-sm sm:text-base">VS</span>
        <input
          ref={awayInputRef}
          value={awayGoals[f.id] ?? ""}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "").slice(0, 2);
            setAwayGoals((a) => ({ ...a, [f.id]: val }));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (editable) void savePrediction(f);
            }
          }}
          inputMode="numeric"
          placeholder="0"
          disabled={!editable}
          aria-label="Away score"
          className="h-10 w-10 shrink-0 touch-manipulation rounded-md border-2 border-primary bg-background/50 text-center text-base font-semibold text-foreground max-sm:h-10 max-sm:w-10 sm:h-11 sm:w-11 md:min-h-[44px] md:w-12 md:text-lg disabled:cursor-not-allowed disabled:opacity-70"
        />
        <div className="flex min-w-[64px] shrink items-center justify-start max-sm:min-w-[64px] sm:min-w-[72px]">
          <TeamDisplay teamName={f.away_team} size={32} align="start" layout="abbr" />
        </div>
      </div>

      <p className="mt-2 text-center text-xs text-muted-foreground">
        {kickoffPassed && !hasFinalScore
          ? "Match in progress or result pending."
          : !kickoffPassed && locked && !editable
            ? "Odds locked — prediction saved as entered."
            : null}
      </p>

      {valid && pick && oddsH != null && oddsD != null && oddsA != null && editable && (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Correct: {correctPointsWithGotw} pts
          {isMatchOfTheWeek ? " (GOTW Bonus +15)" : ""}
          {" · "}Exact: +{exactScoreBonusWithGotw} · Wrong: {wrongLoss}
          {` · ${hg}–${ag} (${pick === "H" ? "Home" : pick === "A" ? "Away" : "Draw"})`}
        </p>
      )}

      {editable && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void savePrediction(f)}
            disabled={!!saving[f.id]}
            className="min-h-[44px] min-w-[120px] touch-manipulation rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {saving[f.id] ? "Saving…" : currentMatchesSaved ? "Update" : "Save"}
          </button>
          {msg[f.id] && (
            <span
              className={
                msg[f.id].startsWith("Error")
                  ? "text-destructive text-sm"
                  : "text-muted-foreground text-sm"
              }
            >
              {msg[f.id]}
            </span>
          )}
        </div>
      )}

      {!editable && saved && !hasFinalScore && (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Saved: {lastSaved ? `${lastSaved.h}–${lastSaved.a}` : `${hg}–${ag}`}
        </p>
      )}

      <FixtureCommunityStats fixtureId={f.id} enabled={hasFinalScore} />
    </div>
  );
}
