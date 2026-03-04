"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { sumTotalPointsFromByGameweek } from "@/lib/history";
import { HistoryView, type HistoryPrediction } from "@/components/history/HistoryView";

type ByGameweek = Record<
  string,
  { predictions: HistoryPrediction[]; total_points: number }
>;

export default function HistoryPage() {
  const [byGameweek, setByGameweek] = useState<ByGameweek>({});
  const [totalPoints, setTotalPoints] = useState(0);
  const [currentGameweek, setCurrentGameweek] = useState<number | null>(null);
  const [selectedGameweek, setSelectedGameweek] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (!cancelled) {
          setErr("Please log in to see your history.");
          setLoading(false);
        }
        return;
      }
      const res = await fetch("/api/predictions/history", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setErr(data.error ?? res.statusText);
        setByGameweek({});
      } else {
        const byGw = data.by_gameweek ?? {};
        setByGameweek(byGw);
        const cgw = data.current_gameweek ?? null;
        setCurrentGameweek(cgw);
        if (cgw != null && selectedGameweek === 1) {
          setSelectedGameweek(cgw);
        }
        setTotalPoints(sumTotalPointsFromByGameweek(byGw));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const gwData = useMemo(() => {
    const key = String(selectedGameweek);
    return byGameweek[key] ?? { predictions: [], total_points: 0 };
  }, [byGameweek, selectedGameweek]);

  const predictionsForGw = gwData.predictions;
  const gameweekPoints = gwData.total_points;

  if (loading) {
    return (
      <main className="min-h-screen bg-background text-foreground p-6">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (err) {
    return (
      <main className="min-h-screen bg-background text-foreground p-6">
        <p className="text-destructive">{err}</p>
        <Link href="/" className="text-primary hover:underline">Dashboard</Link>
      </main>
    );
  }

  const effectiveGw = currentGameweek ?? 38;
  const gw = Math.max(1, Math.min(effectiveGw, selectedGameweek));

  return (
    <HistoryView
      title="Your History"
      backHref="/"
      backLabel="Dashboard"
      totalPoints={totalPoints}
      currentGameweek={currentGameweek}
      selectedGameweek={gw}
      onSelectedGameweekChange={setSelectedGameweek}
      predictionsForGw={predictionsForGw}
      gameweekPoints={gameweekPoints}
    />
  );
}
