"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { sumTotalPointsFromByGameweek } from "@/lib/history";
import { HistoryView, type GameweekBonus, type HistoryPrediction } from "@/components/history/HistoryView";
import type { GotwHistoryEntry } from "@/lib/game-of-the-week-history";

type ByGameweek = Record<
  string,
  { predictions: HistoryPrediction[]; total_points: number; bonuses?: GameweekBonus[] }
>;

export default function HistoryPage() {
  const [byGameweek, setByGameweek] = useState<ByGameweek>({});
  const [totalPoints, setTotalPoints] = useState(0);
  const [currentGameweek, setCurrentGameweek] = useState<number | null>(null);
  const [selectedGameweek, setSelectedGameweek] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [gotwEntries, setGotwEntries] = useState<GotwHistoryEntry[]>([]);
  const [gotwLoading, setGotwLoading] = useState(true);
  const [gotwError, setGotwError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (!cancelled) {
          setErr("Please log in to see your history.");
          setLoading(false);
          setGotwLoading(false);
        }
        return;
      }
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [predRes, gotwRes] = await Promise.all([
        fetch("/api/predictions/history", { headers }),
        fetch("/api/game-of-the-week/history", { headers }),
      ]);
      const data = await predRes.json();
      if (cancelled) return;
      if (!predRes.ok) {
        setErr(data.error ?? predRes.statusText);
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

      if (gotwRes.ok) {
        const gotwData = await gotwRes.json();
        if (!cancelled) {
          setGotwEntries(Array.isArray(gotwData.entries) ? gotwData.entries : []);
          setGotwError(null);
        }
      } else {
        const gotwData = await gotwRes.json().catch(() => ({}));
        if (!cancelled) {
          setGotwEntries([]);
          setGotwError((gotwData as { error?: string }).error ?? gotwRes.statusText);
        }
      }

      setLoading(false);
      setGotwLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const gwData = useMemo(() => {
    const key = String(selectedGameweek);
    return byGameweek[key] ?? { predictions: [], total_points: 0, bonuses: [] };
  }, [byGameweek, selectedGameweek]);

  const predictionsForGw = gwData.predictions;
  const gameweekPoints = gwData.total_points;
  const bonusesForGw = Array.isArray(gwData.bonuses) ? gwData.bonuses : [];

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
      bonusesForGw={bonusesForGw}
      gotwEntries={gotwEntries}
      gotwLoading={gotwLoading}
      gotwError={gotwError}
    />
  );
}
