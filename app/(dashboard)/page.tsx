"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function DashboardPage() {
  const [out, setOut] = useState<{ loading?: boolean; data?: unknown; error?: unknown }>({ loading: true });

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("test").select("*");
      setOut({ data, error });
    })();
  }, []);

  return (
    <main style={{ padding: 40 }}>
      <h1>Supabase connection test</h1>
      <pre>{JSON.stringify(out, null, 2)}</pre>
    </main>
  );
}
