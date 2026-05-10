"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * League play redirect page (route: /play/league/[leagueId]).
 * Predictions in this app are global: one prediction per user per fixture applies to the global leaderboard and every league they're in. There is no league-specific prediction flow.
 * immediately redirect to the main Play page where users make their single set of predictions.
 */
export default function LeaguePlayRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/play");
  }, [router]);

  // message while the redirect happens 
  return <p style={{ padding: 24 }}>Redirecting to Play…</p>;
}
