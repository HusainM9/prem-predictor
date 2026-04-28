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
  form?: {
    home_team: {
      team: string;
      last_five: Array<{
        kickoff_time: string;
        team: string;
        opponent: string;
        goals_for: number;
        goals_against: number;
        result: "W" | "D" | "L";
      }>;
    };
    away_team: {
      team: string;
      last_five: Array<{
        kickoff_time: string;
        team: string;
        opponent: string;
        goals_for: number;
        goals_against: number;
        result: "W" | "D" | "L";
      }>;
    };
  };
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

function formChipClass(result: "W" | "D" | "L"): string {
  if (result === "W") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-300";
  if (result === "L") return "border-red-400/40 bg-red-500/15 text-red-300";
  return "border-border bg-muted/40 text-muted-foreground";
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
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
  /** Editable until kickoff. When odds are locked, the line is frozen for scoring but picks can still be changed. */
  const editable = isScheduled && !kickoffPassed;

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
  const homeForm = f.form?.home_team ?? { team: f.home_team, last_five: [] };
  const awayForm = f.form?.away_team ?? { team: f.away_team, last_five: [] };
  const statusChip =
    hasFinalScore
      ? settled
        ? exactHit
          ? { text: "Exact score", className: "border-primary/40 bg-primary/15 text-primary" }
          : resultCorrect
            ? { text: "Correct result", className: "border-primary/40 bg-primary/10 text-primary" }
            : { text: "Wrong", className: "border-destructive/40 bg-destructive/15 text-destructive" }
        : { text: "Awaiting settlement", className: "border-border bg-muted/30 text-muted-foreground" }
      : currentMatchesSaved
        ? { text: "Saved", className: "border-primary/40 bg-primary/10 text-primary" }
        : hasUnsavedChanges
          ? { text: "Unsaved changes", className: "border-warning/50 bg-warning/15 text-warning" }
          : locked
            ? { text: "Odds locked", className: "border-border bg-muted/30 text-muted-foreground" }
            : editable
              ? { text: "Open", className: "border-primary/30 bg-primary/10 text-primary" }
              : { text: "Closed", className: "border-border bg-muted/30 text-muted-foreground" };

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border/80 bg-card/85 p-4 pl-5 shadow-xl shadow-black/15 ring-1 ring-primary/5 border-l-4 ${barColor}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      {isMatchOfTheWeek && (
        <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/20 blur-3xl" />
      )}

      <div className="relative mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/45 px-3 py-2">
        {oddsH != null && oddsD != null && oddsA != null ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Market
            </span>
            <span className="rounded-full bg-muted/60 px-2 py-1 text-xs font-semibold">
              H {oddsH.toFixed(2)}
            </span>
            <span className="rounded-full bg-muted/60 px-2 py-1 text-xs font-semibold">
              D {oddsD.toFixed(2)}
            </span>
            <span className="rounded-full bg-muted/60 px-2 py-1 text-xs font-semibold">
              A {oddsA.toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground">
              {locked ? "Locked line" : oddsSource === "current" ? "Live odds" : ""}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Odds not available yet</span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {isMatchOfTheWeek && (
            <span className="rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary shadow-sm shadow-primary/10">
              Match of the week
            </span>
          )}
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusChip.className}`}>
            {statusChip.text}
          </span>
        </div>
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
            <span
              className={`text-xs font-medium ${
                (meta?.points_awarded ?? 0) + (meta?.bonus_exact_score_points ?? 0) < 0
                  ? "text-destructive"
                  : "text-primary"
              }`}
            >
              {(meta?.points_awarded ?? 0) + (meta?.bonus_exact_score_points ?? 0)} pts
            </span>
          )}
        </div>
      )}

      <div className="relative rounded-2xl border border-border/70 bg-background/50 p-3 shadow-inner shadow-black/10">
        <div className="flex min-h-[4.5rem] flex-nowrap items-center justify-center gap-2 max-sm:gap-2 sm:gap-3 md:gap-4">
          <div className="flex min-w-[66px] shrink items-center justify-end max-sm:min-w-[66px] sm:min-w-[82px]">
            <TeamDisplay teamName={f.home_team} size={36} align="end" layout="abbr" />
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
            className="h-12 w-12 shrink-0 touch-manipulation rounded-xl border border-primary/60 bg-card text-center text-xl font-black tabular-nums text-foreground shadow-lg shadow-primary/10 transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 max-sm:h-11 max-sm:w-11 sm:h-14 sm:w-14 sm:text-2xl disabled:cursor-not-allowed disabled:opacity-70"
          />
          <span className="shrink-0 rounded-full border border-border/70 bg-muted/35 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            VS
          </span>
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
            className="h-12 w-12 shrink-0 touch-manipulation rounded-xl border border-primary/60 bg-card text-center text-xl font-black tabular-nums text-foreground shadow-lg shadow-primary/10 transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 max-sm:h-11 max-sm:w-11 sm:h-14 sm:w-14 sm:text-2xl disabled:cursor-not-allowed disabled:opacity-70"
          />
          <div className="flex min-w-[66px] shrink items-center justify-start max-sm:min-w-[66px] sm:min-w-[82px]">
            <TeamDisplay teamName={f.away_team} size={36} align="start" layout="abbr" />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground/90">{homeForm.team} form</p>
          <div className="mt-2 flex items-center gap-1">
            {homeForm.last_five.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">No recent matches</span>
            ) : (
              homeForm.last_five.map((m, idx) => (
                <span
                  key={`${f.id}-home-form-dot-${idx}`}
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md border px-1 text-[10px] font-bold ${formChipClass(m.result)}`}
                  title={`${m.result}: ${m.team} ${m.goals_for}-${m.goals_against} ${m.opponent}`}
                >
                  {m.result}
                </span>
              ))
            )}
          </div>
          {homeForm.last_five.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-foreground/90 hover:text-foreground">
                Last 5 matches
              </summary>
              <ul className="mt-2 space-y-1.5">
                {homeForm.last_five.map((m, idx) => (
                  <li key={`${f.id}-home-form-${idx}`} className="text-[11px] sm:text-xs">
                    {formatShortDate(m.kickoff_time)} · {m.team} {m.goals_for}-{m.goals_against} {m.opponent}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5 text-xs text-muted-foreground text-right">
          <p className="font-semibold text-foreground/90">{awayForm.team} form</p>
          <div className="mt-2 flex items-center justify-end gap-1">
            {awayForm.last_five.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">No recent matches</span>
            ) : (
              awayForm.last_five.map((m, idx) => (
                <span
                  key={`${f.id}-away-form-dot-${idx}`}
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md border px-1 text-[10px] font-bold ${formChipClass(m.result)}`}
                  title={`${m.result}: ${m.team} ${m.goals_for}-${m.goals_against} ${m.opponent}`}
                >
                  {m.result}
                </span>
              ))
            )}
          </div>
          {awayForm.last_five.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-foreground/90 hover:text-foreground">
                Last 5 matches
              </summary>
              <ul className="mt-2 space-y-1.5">
                {awayForm.last_five.map((m, idx) => (
                  <li key={`${f.id}-away-form-${idx}`} className="text-[11px] sm:text-xs">
                    {formatShortDate(m.kickoff_time)} · {m.team} {m.goals_for}-{m.goals_against} {m.opponent}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      <p className="mt-2 text-center text-xs text-muted-foreground">
        {kickoffPassed && !hasFinalScore
          ? "Match in progress or result pending."
          : !kickoffPassed && locked
            ? "Odds locked. You can still update your score until kickoff."
            : null}
      </p>

      {valid && pick && oddsH != null && oddsD != null && oddsA != null && editable && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-background/45 p-2 text-center text-xs sm:grid-cols-4">
          <div className="rounded-lg bg-muted/30 px-2 py-2">
            <p className="text-muted-foreground">Correct</p>
            <p className="font-bold text-primary">
              {correctPointsWithGotw} pts
            </p>
          </div>
          <div className="rounded-lg bg-muted/30 px-2 py-2">
            <p className="text-muted-foreground">Exact</p>
            <p className="font-bold text-primary">+{exactScoreBonusWithGotw}</p>
          </div>
          <div className="rounded-lg bg-muted/30 px-2 py-2">
            <p className="text-muted-foreground">Wrong</p>
            <p className="font-bold text-destructive">{wrongLoss}</p>
          </div>
          <div className="rounded-lg bg-primary/10 px-2 py-2">
            <p className="text-muted-foreground">Pick</p>
            <p className="font-bold text-foreground">
              {hg}–{ag} {pick === "H" ? "Home" : pick === "A" ? "Away" : "Draw"}
            </p>
          </div>
          {isMatchOfTheWeek && (
            <p className="col-span-2 text-[11px] font-medium text-primary sm:col-span-4">
              Match of the Week bonus included.
            </p>
          )}
        </div>
      )}

      {editable && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void savePrediction(f)}
            disabled={!!saving[f.id]}
            className="min-h-[44px] min-w-[132px] touch-manipulation rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:translate-y-0 disabled:opacity-50 motion-reduce:transition-none"
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

      <div className="mt-4 border-t border-border/60 pt-3">
        <FixtureCommunityStats fixtureId={f.id} enabled={hasFinalScore} />
      </div>
    </div>
  );
}
