"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { HistoryView, type HistoryPrediction } from "@/components/history/HistoryView";

type PredictionItem = {
  prediction_id: string;
  fixture_id: string;
  pred_home_goals: number | null;
  pred_away_goals: number | null;
  pick: string | null;
  points_awarded: number;
  bonus_exact_score_points: number;
  settled_at: string | null;
  prediction_hidden?: boolean;
  fixture: {
    home_team: string;
    away_team: string;
    kickoff_time: string;
    gameweek: number;
    status: string;
    home_goals: number | null;
    away_goals: number | null;
  } | null;
};

function toHistoryPrediction(p: PredictionItem): HistoryPrediction {
  return {
    prediction_id: p.prediction_id,
    fixture_id: p.fixture_id,
    pred_home_goals: p.pred_home_goals ?? 0,
    pred_away_goals: p.pred_away_goals ?? 0,
    points_awarded: p.points_awarded,
    bonus_exact_score_points: p.bonus_exact_score_points,
    settled_at: p.settled_at,
    prediction_hidden: p.prediction_hidden === true,
    fixture: p.fixture
      ? {
          home_team: p.fixture.home_team,
          away_team: p.fixture.away_team,
          gameweek: p.fixture.gameweek,
          home_goals: p.fixture.home_goals,
          away_goals: p.fixture.away_goals,
        }
      : null,
  };
}

export default function PlayerPredictionsPage() {
  const params = useParams();
  const userId = typeof params.userId === "string" ? params.userId : null;

  const [predictions, setPredictions] = useState<PredictionItem[]>([]);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [favouriteTeam, setFavouriteTeam] = useState<string | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const [currentGameweek, setCurrentGameweek] = useState<number | null>(null);
  const [selectedGameweek, setSelectedGameweek] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      queueMicrotask(() => {
        setErr("Missing user");
        setLoading(false);
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      setLoading(true);
      setErr(null);
    });

    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      return fetch(`/api/player/${encodeURIComponent(userId)}/predictions`, { headers });
    };

    load()
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setErr(d.error);
        else {
          setPredictions(d.predictions ?? []);
          setDisplayName(d.display_name ?? null);
          setFavouriteTeam(d.favourite_team ?? null);
          setTotalPoints(d.total_points ?? 0);
          const cgw = d.current_gameweek ?? null;
          setCurrentGameweek(cgw);
          if (cgw != null) setSelectedGameweek(cgw);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const filteredByGw = useMemo(() => {
    return predictions.filter((p) => p.fixture?.gameweek === selectedGameweek);
  }, [predictions, selectedGameweek]);

  const predictionsForGw: HistoryPrediction[] = useMemo(
    () => filteredByGw.map(toHistoryPrediction),
    [filteredByGw]
  );

  const gameweekPoints = useMemo(
    () =>
      filteredByGw.reduce(
        (sum, p) => sum + p.points_awarded + p.bonus_exact_score_points,
        0
      ),
    [filteredByGw]
  );

  if (!userId) {
    return (
      <main className="min-h-screen bg-background text-foreground p-4 max-sm:p-4 sm:p-6">
        <p>Invalid user.</p>
        <Link href="/leaderboard" className="text-primary hover:underline">
          Leaderboard
        </Link>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background text-foreground p-4 max-sm:p-4 sm:p-6">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (err) {
    return (
      <main className="min-h-screen bg-background text-foreground p-4 max-sm:p-4 sm:p-6">
        <p className="text-destructive">Error: {err}</p>
        <Link href="/leaderboard" className="text-primary hover:underline">
          Leaderboard
        </Link>
      </main>
    );
  }

  const effectiveGw = currentGameweek ?? 38;
  const gw = Math.max(1, Math.min(effectiveGw, selectedGameweek));

  return (
    <HistoryView
      title={displayName ? `${displayName}'s History` : "History"}
      backHref="/leaderboard"
      backLabel="Leaderboard"
      totalPoints={totalPoints}
      currentGameweek={currentGameweek}
      selectedGameweek={gw}
      onSelectedGameweekChange={setSelectedGameweek}
      predictionsForGw={predictionsForGw}
      gameweekPoints={gameweekPoints}
      titleAvatarTeam={favouriteTeam}
    />
  );
}
