"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next") || "/";
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace(next);
        return;
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (cancelled) return;
      if (exchangeError) {
        setError(exchangeError.message);
        return;
      }
      router.replace(next);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <main className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-destructive text-center text-sm">{error}</p>
        <button
          type="button"
          className="text-primary text-sm underline underline-offset-4"
          onClick={() => router.replace("/login")}
        >
          Back to log in
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
      <p className="text-muted-foreground">Signing you in…</p>
    </main>
  );
}
