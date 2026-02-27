"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * League play redirect page (route: /play/league/[leagueId]).
 *
 * Predictions in this app are global: one prediction per user per fixture applies to the
 * global leaderboard and every league they're in. There is no league-specific prediction flow.
 *
 * This page exists so that old links or bookmarks to "predict for a league" (e.g. /play/league/abc-123)
 * still work: immediately redirect to the main Play page (/play) where users make their
 * single set of predictions.
 */
export default function LeaguePlayRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/play");
  }, [router]);

  // Brief message while the redirect happens (replace avoids back-button returning here).
  return <p style={{ padding: 24 }}>Redirecting to Play…</p>;
}
