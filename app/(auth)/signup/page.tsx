"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { validateDisplayName, DISPLAY_NAME_MAX_LENGTH } from "@/lib/name-validation";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = displayName.trim();
    const validation = validateDisplayName(trimmed);
    if (!validation.valid) {
      setMsg(validation.error);
      return;
    }
    setLoading(true);
    setMsg(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: trimmed } },
    });

    setLoading(false);

    if (error) return setMsg(error.message);

    // If email confirmations are off, user is logged in immediately.
    // If on, they must confirm via email first.
    router.push("/");
  }

  return (
    <main style={{ padding: 40, maxWidth: 420 }}>
      <h1>Sign up</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <label>
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            type="text"
            required
            minLength={1}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            placeholder="How you'll appear on the leaderboard"
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={6}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <button disabled={loading} style={{ padding: 10 }}>
          {loading ? "Creating account..." : "Create account"}
        </button>

        {msg && <p style={{ color: "crimson" }}>{msg}</p>}
      </form>
    </main>
  );
}
