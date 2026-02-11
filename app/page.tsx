"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

/** Home: anyone can browse Play, Matches, Leaderboard, Table. Submit and History require login. */
export default function Home() {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>Prem Predictor</h1>

      {userEmail ? (
        <p>Logged in</p>
      ) : (
        <p>You're not logged in. You can view fixtures and explore; log in to submit predictions.</p>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
        {userEmail ? (
          <button onClick={logout} style={{ padding: 10 }}>
            Log out
          </button>
        ) : (
          <>
            <Link href="/login">Log in</Link>
            <Link href="/signup">Sign up</Link>
          </>
        )}
      </div>

      <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Link href="/play">Make your predictions</Link>
        <Link href="/matches">Matches</Link>
        <Link href="/leaderboard">Leaderboard</Link>
        <Link href="/history">My history</Link>
        <Link href="/table">League table</Link>
      </div>
    </main>
  );
}
