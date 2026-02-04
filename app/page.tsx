"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

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
        <>
          <p>Logged in as: {userEmail}</p>
          <button onClick={logout} style={{ padding: 10, marginTop: 10 }}>
            Log out
          </button>

          <div style={{ marginTop: 20 }}>
            <Link href="/play">Make your predictions</Link>
          </div>
        </>
      ) : (
        <>
          <p>You’re not logged in.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <Link href="/login">Log in</Link>
            <Link href="/signup">Sign up</Link>
          </div>
        </>
      )}
    </main>
  );
}
